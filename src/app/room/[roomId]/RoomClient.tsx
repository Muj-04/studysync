'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Link2, Check, ChevronLeft, ChevronRight,
  Undo2, MousePointer, Pencil, Eraser, Minus, Plus,
  ChevronDown, FilePlus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchRoom, joinRoom, fetchDrawings, saveRoomDrawing, fetchRoomDrawing,
  fetchRoomVoiceNotes, fetchSingleRoomVoiceNote,
  saveRoomBlankPage, fetchRoomBlankPages,
} from '@/lib/supabase/db';
import { usePDF } from '@/hooks/usePDF';
import { usePDFDrawings } from '@/hooks/usePDFDrawings';
import { useStudyRoom } from '@/hooks/useStudyRoom';
import type { RoomVoiceNotePayload, RoomBlankPagePayload } from '@/hooks/useStudyRoom';
import { useRoomVoiceNotes } from '@/hooks/useRoomVoiceNotes';
import { clampZoom } from '@/components/PDFViewer';
import PDFWithDrawing from '@/components/PDFWithDrawing';
import type { DrawingCanvasHandle } from '@/components/PDFWithDrawing';
import BlankPageCanvas from '@/components/BlankPageCanvas';
import type { DrawingCanvasHandle as BlankCanvasHandle } from '@/components/BlankPageCanvas';
import VoiceNotesSheet from '@/components/VoiceNotesSheet';
import { PRESET_COLORS, SIZES } from '@/lib/drawing';
import type { Tool, PenType } from '@/lib/drawing';
import type { BlankPage } from '@/types';

// ── Virtual page sequence ─────────────────────────────────────────────────────

type VirtualPage =
  | { type: 'pdf'; pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

function buildVirtualSequence(pdfPageCount: number, blankPages: BlankPage[]): VirtualPage[] {
  const pages: VirtualPage[] = [];
  blankPages
    .filter((b) => b.insertAfterPage === 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((b) => pages.push({ type: 'blank', blankPage: b }));
  for (let p = 1; p <= pdfPageCount; p++) {
    pages.push({ type: 'pdf', pdfPage: p });
    blankPages
      .filter((b) => b.insertAfterPage === p)
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((b) => pages.push({ type: 'blank', blankPage: b }));
  }
  return pages;
}

// ── Blank page themes ─────────────────────────────────────────────────────────

const BG_THEMES = [
  { theme: 'white' as const, label: 'White', bg: '#ffffff',  dotColor: 'rgba(0,0,0,0.15)' },
  { theme: 'dark'  as const, label: 'Dark',  bg: '#1e1e2e',  dotColor: 'rgba(255,255,255,0.18)' },
];

// ── Member avatar chip ────────────────────────────────────────────────────────

function MemberAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');
  return (
    <div
      title={name}
      style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        fontSize: 9.5, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, border: '1.5px solid var(--bg-panel)',
        marginLeft: -6,
      }}
    >
      {initials || '?'}
    </div>
  );
}

// ── Toolbar primitives ────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />;
}

function ToolBtn({
  active, onClick, title, children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 30, padding: '0 9px', gap: 5,
        borderRadius: 6, fontSize: 12, fontWeight: 500,
        background: active ? 'var(--accent)' : 'var(--bg-elevated)',
        color: active ? '#fff' : 'var(--text-2)',
        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
        whiteSpace: 'nowrap',
      }}
      onMouseOver={(e) => { if (!active) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' }); }}
      onMouseOut={(e)  => { if (!active) Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' }); }}
    >
      {children}
    </button>
  );
}

function IconBtn({
  onClick, title, disabled, children,
}: {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 6,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, flexShrink: 0,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => { if (!disabled) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' }); }}
      onMouseOut={(e)  => { if (!disabled) Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' }); }}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [status, setStatus]     = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [roomName, setRoomName] = useState('Study Room');
  const [copied, setCopied]     = useState(false);
  const [userName, setUserName] = useState('');

  // ── Drawing state ─────────────────────────────────────────────────────────
  const [tool, setTool]             = useState<Tool>('pen');
  const [penType, setPenType]       = useState<PenType>('normal');
  const [color, setColor]           = useState('#ededf0');
  const [strokeSize, setStrokeSize] = useState(5);
  const [zoom, setZoom]             = useState(1.0);

  // ── Voice notes state ─────────────────────────────────────────────────────
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);

  // ── Blank pages state ─────────────────────────────────────────────────────
  const [docId, setDocId]                 = useState<string | null>(null);
  const [roomBlankPages, setRoomBlankPages] = useState<RoomBlankPagePayload[]>([]);
  const [blankCanvasData, setBlankCanvasData] = useState<Record<string, string>>({});
  const [virtualIndex, setVirtualIndex]   = useState(0);
  const [blankMenuOpen, setBlankMenuOpen] = useState(false);
  const pendingBlankIdRef = useRef<string | null>(null);

  const drawingRef      = useRef<DrawingCanvasHandle | null>(null);
  const blankDrawingRef = useRef<BlankCanvasHandle | null>(null);
  const docIdRef        = useRef<string | null>(null);
  const currentPageRef  = useRef<number>(1);
  const currentVPRef    = useRef<VirtualPage | null>(null);
  const saveRoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to wire useStudyRoom callbacks → useRoomVoiceNotes (defined after hooks)
  const addIncomingNoteRef    = useRef<((p: RoomVoiceNotePayload) => void) | null>(null);
  const removeIncomingNoteRef = useRef<((id: string) => void) | null>(null);
  const seedNotesRef          = useRef<((remote: Parameters<ReturnType<typeof useRoomVoiceNotes>['seedNotes']>[0]) => void) | null>(null);

  const { activeDocument, addDocument, goToPage } = usePDF();
  const { getDrawing, saveDrawing, seedDrawings }  = usePDFDrawings();

  const broadcastRef = useRef<(page: number, data: string) => void>(() => {});

  // ── Virtual page sequence ─────────────────────────────────────────────────
  const virtualSequence = useMemo<VirtualPage[]>(() => {
    if (!docId || !activeDocument) return [];
    const blankPages: BlankPage[] = roomBlankPages.map((bp) => ({
      id: bp.id,
      documentId: docId,
      insertAfterPage: bp.insertAfterPage,
      bgTheme: bp.bgTheme,
      createdAt: bp.createdAt,
    }));
    return buildVirtualSequence(activeDocument.pageCount, blankPages);
  }, [docId, activeDocument, roomBlankPages]);

  const currentVP = virtualSequence[virtualIndex] ?? null;
  useEffect(() => { currentVPRef.current = currentVP; }, [currentVP]);

  // Navigate to new blank page once virtualSequence updates
  useEffect(() => {
    if (!pendingBlankIdRef.current) return;
    const idx = virtualSequence.findIndex(
      (vp) => vp.type === 'blank' && vp.blankPage.id === pendingBlankIdRef.current,
    );
    if (idx >= 0) {
      setVirtualIndex(idx);
      pendingBlankIdRef.current = null;
    }
  }, [virtualSequence]);

  // Sync PDF page when virtual index points to a PDF page
  useEffect(() => {
    if (currentVP?.type === 'pdf') {
      goToPage(currentVP.pdfPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualIndex]);

  // ── Incoming handlers ─────────────────────────────────────────────────────
  const handleIncomingDrawing = useCallback((pageNumber: number, data: string) => {
    if (currentPageRef.current === pageNumber) {
      drawingRef.current?.loadData?.(data);
    }
  }, []);

  const handleReconnect = useCallback(() => {
    const did = docIdRef.current;
    if (!did || !activeDocument) return;
    const page = activeDocument.currentPage;
    const data = getDrawing(did, page);
    if (data) broadcastRef.current(page, data);
  }, [activeDocument, getDrawing]);

  const handleIncomingVoiceNoteAdded = useCallback(async (noteId: string) => {
    console.log('[Room] received voice_note_added, fetching from DB:', noteId);
    const note = await fetchSingleRoomVoiceNote(noteId, roomId);
    console.log('[Room] fetched note from DB:', note);
    if (note && note.audioUrl) {
      addIncomingNoteRef.current?.({
        id: note.id,
        pageNumber: note.pageNumber,
        duration: note.duration,
        audioUrl: note.audioUrl,
        timestamp: note.timestamp,
        title: note.title,
      });
    } else {
      console.warn('[Room] note fetch failed or missing audioUrl:', note);
    }
  }, [roomId]);

  const handleIncomingVoiceNoteDelete = useCallback((id: string) => {
    removeIncomingNoteRef.current?.(id);
  }, []);

  const handleIncomingBlankPage = useCallback((page: RoomBlankPagePayload) => {
    setRoomBlankPages((prev) => {
      if (prev.some((p) => p.id === page.id)) return prev;
      return [...prev, page];
    });
  }, []);

  const handleIncomingBlankDrawing = useCallback((pageId: string, data: string) => {
    setBlankCanvasData((prev) => ({ ...prev, [pageId]: data }));
    if (currentVPRef.current?.type === 'blank' && currentVPRef.current.blankPage.id === pageId) {
      blankDrawingRef.current?.loadData?.(data);
    }
  }, []);

  const {
    broadcastDrawing, broadcastBlankDrawing,
    broadcastVoiceNoteAdded, broadcastVoiceNoteDelete,
    broadcastBlankPageAdded,
    memberCount, memberNames,
  } = useStudyRoom(
    roomId, handleIncomingDrawing, handleReconnect,
    handleIncomingVoiceNoteAdded, handleIncomingVoiceNoteDelete,
    handleIncomingBlankPage, userName,
    handleIncomingBlankDrawing,
  );

  useEffect(() => { broadcastRef.current = broadcastDrawing; }, [broadcastDrawing]);

  // Stable broadcast callbacks for voice notes
  const handleNoteAdded = useCallback((noteId: string) => {
    broadcastVoiceNoteAdded(noteId);
  }, [broadcastVoiceNoteAdded]);

  const handleNoteDeleted = useCallback((noteId: string) => {
    broadcastVoiceNoteDelete(noteId);
  }, [broadcastVoiceNoteDelete]);

  const {
    notes: voiceNotes,
    isRecording: voiceIsRecording,
    recordingDuration: voiceRecordingDuration,
    recordingContext: voiceRecordingContext,
    startRecording: voiceStartRecording,
    stopRecording: voiceStopRecording,
    deleteNote: voiceDeleteNote,
    updateNoteTitle: voiceUpdateNoteTitle,
    getNotesForPage: voiceGetNotesForPage,
    seedNotes: voiceSeedNotes,
    addIncomingNote,
    removeIncomingNote,
  } = useRoomVoiceNotes(roomId, handleNoteAdded, handleNoteDeleted);

  // Keep incoming + seed refs in sync
  useEffect(() => { addIncomingNoteRef.current    = addIncomingNote; },    [addIncomingNote]);
  useEffect(() => { removeIncomingNoteRef.current = removeIncomingNote; }, [removeIncomingNote]);
  useEffect(() => { seedNotesRef.current          = voiceSeedNotes; },     [voiceSeedNotes]);

  // Auto-open sheet when recording starts
  useEffect(() => { if (voiceIsRecording) setVoiceSheetOpen(true); }, [voiceIsRecording]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const name = (user.user_metadata?.full_name as string | undefined)
        ?? (user.user_metadata?.name as string | undefined)
        ?? user.email?.split('@')[0]
        ?? 'Member';
      setUserName(name);

      const room = await fetchRoom(roomId);
      if (!room) { setErrorMsg('Room not found or has been closed.'); setStatus('error'); return; }
      setRoomName(room.documentName);

      const { data: signed, error: signErr } = await supabase.storage
        .from('pdfs').createSignedUrl(room.pdfPath, 3600);
      if (signErr || !signed?.signedUrl) {
        setErrorMsg('Could not access the room PDF. It may have been deleted.');
        setStatus('error'); return;
      }

      const resp = await fetch(signed.signedUrl);
      if (!resp.ok) { setErrorMsg('Failed to download the PDF.'); setStatus('error'); return; }

      const blob = await resp.blob();
      const file = new File([blob], room.documentName + '.pdf', { type: 'application/pdf' });
      const { id: newDocId } = await addDocument(file);
      docIdRef.current = newDocId;
      if (!cancelled) setDocId(newDocId);

      const [remoteDrawings, remoteVoiceNotes, remoteBlankPages] = await Promise.all([
        fetchDrawings(newDocId),
        fetchRoomVoiceNotes(roomId),
        fetchRoomBlankPages(roomId),
      ]);

      const prefixed: Record<string, string> = {};
      for (const [k, v] of Object.entries(remoteDrawings)) prefixed[`${newDocId}:${k}`] = v;
      if (Object.keys(prefixed).length > 0) seedDrawings(prefixed);

      if (remoteVoiceNotes.length > 0 && !cancelled) {
        seedNotesRef.current?.(remoteVoiceNotes);
      }

      if (remoteBlankPages.length > 0 && !cancelled) {
        setRoomBlankPages(remoteBlankPages);
      }

      await joinRoom(roomId);
      if (!cancelled) setStatus('ready');
    }
    init().catch((e) => {
      console.error('[Room] init error:', e);
      setErrorMsg('Something went wrong loading the room.');
      setStatus('error');
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPdfPage = currentVP?.type === 'pdf' ? currentVP.pdfPage : (activeDocument?.currentPage ?? 1);
  const totalPages     = virtualSequence.length || (activeDocument?.pageCount ?? 1);
  const isBlankPage    = currentVP?.type === 'blank';
  const currentDrawing = activeDocument && currentVP?.type === 'pdf'
    ? getDrawing(activeDocument.id, currentVP.pdfPage) : undefined;

  useEffect(() => { currentPageRef.current = currentPdfPage; }, [currentPdfPage]);

  useEffect(() => {
    if (status !== 'ready' || isBlankPage) return;
    fetchRoomDrawing(roomId, currentPdfPage).then((data) => {
      if (data) drawingRef.current?.loadData?.(data);
    });
  }, [currentPdfPage, status, roomId, isBlankPage]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = useCallback((data: string) => {
    if (!activeDocument || isBlankPage) return;
    const page = activeDocument.currentPage;
    saveDrawing(activeDocument.id, page, data);
    broadcastDrawing(page, data);
    if (saveRoomTimerRef.current) clearTimeout(saveRoomTimerRef.current);
    saveRoomTimerRef.current = setTimeout(() => {
      saveRoomDrawing(roomId, page, data);
    }, 500);
  }, [activeDocument, isBlankPage, saveDrawing, broadcastDrawing, roomId]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  const prevPage = useCallback(() => {
    setVirtualIndex((i) => Math.max(0, i - 1));
  }, []);

  const nextPage = useCallback(() => {
    setVirtualIndex((i) => Math.min(virtualSequence.length - 1, i + 1));
  }, [virtualSequence.length]);

  const handleZoomOut = useCallback(() => setZoom((z) => clampZoom(z - 0.1)), []);
  const handleZoomIn  = useCallback(() => setZoom((z) => clampZoom(z + 0.1)), []);

  const selectTool = useCallback((t: Tool, pt?: PenType) => {
    setTool(t);
    if (pt) setPenType(pt);
  }, []);

  const handleAddBlankPage = useCallback((theme: 'white' | 'dark') => {
    setBlankMenuOpen(false);
    const insertAfterPage = currentVP?.type === 'pdf'
      ? currentVP.pdfPage
      : currentVP?.type === 'blank'
        ? currentVP.blankPage.insertAfterPage
        : 0;
    const page: RoomBlankPagePayload = {
      id: crypto.randomUUID(),
      insertAfterPage,
      bgTheme: theme,
      createdAt: Date.now(),
    };
    pendingBlankIdRef.current = page.id;
    setRoomBlankPages((prev) => [...prev, page]);
    saveRoomBlankPage(roomId, page);
    broadcastBlankPageAdded(page);
  }, [currentVP, roomId, broadcastBlankPageAdded]);

  // Close blank menu on outside click
  useEffect(() => {
    if (!blankMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-blank-menu]')) setBlankMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [blankMenuOpen]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg-app)', color: 'var(--text-2)', fontFamily: 'inherit',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 14, margin: 0 }}>Loading study room…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
      }}>
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Could not open room</p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{errorMsg}</p>
        <button
          onClick={() => router.replace('/workspace')}
          style={{
            marginTop: 8, padding: '8px 20px', borderRadius: 8, fontSize: 13,
            background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          Back to workspace
        </button>
      </div>
    );
  }

  // ── Derived for voice notes ───────────────────────────────────────────────
  const pageNotes = voiceGetNotesForPage(currentPdfPage);
  const pageKey   = `${roomId}:${currentPdfPage}`;

  // ── Members display ───────────────────────────────────────────────────────
  const visibleNames  = memberNames.slice(0, 3);
  const hiddenCount   = memberNames.length > 3 ? memberNames.length - 3 : 0;

  // ── Room UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)', flexShrink: 0,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {roomName}
        </span>

        {/* Member avatars + names */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {memberNames.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
              {visibleNames.map((name, i) => (
                <MemberAvatar key={i} name={name} />
              ))}
              {hiddenCount > 0 && (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--bg-elevated)', color: 'var(--text-2)',
                  fontSize: 9, fontWeight: 700, border: '1.5px solid var(--bg-panel)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginLeft: -6, flexShrink: 0,
                }}>
                  +{hiddenCount}
                </div>
              )}
            </div>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {memberNames.length > 0
              ? `${memberNames.slice(0, 2).join(', ')}${memberNames.length > 2 ? ` +${memberNames.length - 2}` : ''} • ${memberCount} live`
              : `${memberCount} live`}
          </span>
        </div>

        <button
          onClick={copyLink}
          title="Copy room link"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: copied ? 'var(--green-muted, #14532d22)' : 'var(--bg-elevated)',
            color: copied ? 'var(--green, #4ade80)' : 'var(--text-2)',
            border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {copied ? <Check size={12} /> : <Link2 size={12} />}
          {copied ? 'Copied!' : 'Share link'}
        </button>

        {/* Red Leave button */}
        <button
          onClick={() => router.replace('/workspace')}
          style={{
            padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: 'rgba(239,68,68,0.12)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.35)',
            cursor: 'pointer',
            transition: 'background 0.13s, border-color 0.13s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.22)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.12)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
          }}
        >
          Leave
        </button>
      </div>

      {/* ── Drawing toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)', flexShrink: 0, flexWrap: 'wrap',
        rowGap: 6,
      }}>

        {/* ── Tools ── */}
        <div style={{ display: 'flex', gap: 3 }}>
          <ToolBtn active={tool === 'cursor'} onClick={() => selectTool('cursor')} title="Cursor">
            <MousePointer size={13} />
            <span>Cursor</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'normal'}
            onClick={() => selectTool('pen', 'normal')}
            title="Pen"
          >
            <Pencil size={13} />
            <span>Pen</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'marker'}
            onClick={() => selectTool('pen', 'marker')}
            title="Marker"
          >
            <div style={{ width: 13, height: 5, borderRadius: 2, background: 'currentColor', opacity: 0.75 }} />
            <span>Marker</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'highlighter'}
            onClick={() => selectTool('pen', 'highlighter')}
            title="Highlighter"
          >
            <div style={{ width: 13, height: 8, borderRadius: 2, background: 'currentColor', opacity: 0.4 }} />
            <span>Highlight</span>
          </ToolBtn>
          <ToolBtn active={tool === 'eraser'} onClick={() => selectTool('eraser')} title="Eraser">
            <Eraser size={13} />
            <span>Eraser</span>
          </ToolBtn>
        </div>

        <Divider />

        {/* ── Color ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                if (tool === 'eraser' || tool === 'cursor') setTool('pen');
              }}
              title={c}
              style={{
                width: 20, height: 20, borderRadius: '50%', background: c,
                border: 'none', cursor: 'pointer', flexShrink: 0,
                outline: color === c && tool !== 'eraser' ? '2px solid var(--accent-hover)' : '1.5px solid transparent',
                outlineOffset: 2,
                transform: color === c && tool !== 'eraser' ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.12s',
              }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              if (tool === 'eraser' || tool === 'cursor') setTool('pen');
            }}
            title="Custom color"
            style={{
              width: 20, height: 20,
              border: '1px solid var(--border-strong)',
              borderRadius: 4, background: 'var(--bg-input)',
              padding: 0, cursor: 'pointer', flexShrink: 0,
            }}
          />
        </div>

        <Divider />

        {/* ── Stroke size ── */}
        <div style={{ display: 'flex', gap: 3 }}>
          {SIZES.map(({ label, value }) => (
            <ToolBtn
              key={value}
              active={strokeSize === value}
              onClick={() => setStrokeSize(value)}
              title={`Size ${label}`}
            >
              {label}
            </ToolBtn>
          ))}
        </div>

        <Divider />

        {/* ── Zoom ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <IconBtn onClick={handleZoomOut} title="Zoom out" disabled={zoom <= 0.5}>
            <Minus size={12} />
          </IconBtn>
          <span style={{
            fontSize: 11.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums',
            minWidth: 36, textAlign: 'center', flexShrink: 0,
          }}>
            {Math.round(zoom * 100)}%
          </span>
          <IconBtn onClick={handleZoomIn} title="Zoom in" disabled={zoom >= 2.0}>
            <Plus size={12} />
          </IconBtn>
        </div>

        <Divider />

        {/* ── Undo ── */}
        <IconBtn
          onClick={() => isBlankPage ? blankDrawingRef.current?.undo?.() : drawingRef.current?.undo?.()}
          title="Undo last stroke"
        >
          <Undo2 size={13} />
        </IconBtn>

        <Divider />

        {/* ── Add Blank Page ── */}
        <div style={{ position: 'relative' }} data-blank-menu>
          <button
            onClick={() => setBlankMenuOpen((o) => !o)}
            title="Add blank page"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 9px',
              borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: blankMenuOpen ? 'var(--bg-hover)' : 'var(--bg-elevated)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              transition: 'background 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e) => { if (!blankMenuOpen) Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' }); }}
          >
            <FilePlus size={13} />
            <span>Blank</span>
            <ChevronDown size={9} strokeWidth={2.5} style={{ opacity: 0.6 }} />
          </button>

          {blankMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 9, padding: 10,
              boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
              zIndex: 200,
            }}>
              <p style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8, margin: '0 0 8px',
              }}>
                Background
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                {BG_THEMES.map(({ theme, label, bg, dotColor }) => (
                  <button
                    key={theme}
                    onClick={() => handleAddBlankPage(theme)}
                    title={`Add ${label} blank page`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      border: '1px solid var(--border)', borderRadius: 6, padding: '5px 6px',
                      cursor: 'pointer', background: 'transparent', fontFamily: 'inherit',
                      minWidth: 60, transition: 'background 0.13s, border-color 0.13s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.borderColor = 'var(--border-strong)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    <div style={{
                      width: 48, height: 30, borderRadius: 4,
                      backgroundColor: bg,
                      backgroundImage: `radial-gradient(circle, ${dotColor} 1.2px, transparent 1.2px)`,
                      backgroundSize: '10px 10px',
                      border: '1px solid rgba(128,128,128,0.2)',
                    }} />
                    <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PDF / blank page viewer ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {activeDocument && !isBlankPage && (
          <PDFWithDrawing
            key={`${activeDocument.id}-p${currentPdfPage}`}
            ref={drawingRef}
            document={activeDocument}
            tool={tool}
            penType={penType}
            color={color}
            strokeSize={strokeSize}
            savedData={currentDrawing}
            onSave={handleSave}
            zoom={zoom}
            onZoomChange={setZoom}
            interactive={true}
          />
        )}
        {isBlankPage && currentVP?.type === 'blank' && (
          <BlankPageCanvas
            key={currentVP.blankPage.id}
            ref={blankDrawingRef}
            blankPage={{
              ...currentVP.blankPage,
              canvasData: blankCanvasData[currentVP.blankPage.id],
            }}
            onSaveData={(id, data) => {
              setBlankCanvasData((prev) => ({ ...prev, [id]: data }));
              broadcastBlankDrawing(id, data);
            }}
            onSaveImages={() => {}}
            tool={tool}
            penType={penType}
            color={color}
            strokeSize={strokeSize}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        )}
      </div>

      {/* ── Voice Notes ── */}
      <VoiceNotesSheet
        isOpen={voiceSheetOpen}
        onToggle={() => setVoiceSheetOpen((o) => !o)}
        notes={pageNotes}
        pageKey={pageKey}
        documentId={roomId}
        pageNumber={currentPdfPage}
        isRecording={voiceIsRecording}
        recordingDuration={voiceRecordingDuration}
        recordingContext={voiceRecordingContext}
        onStart={() => voiceStartRecording(currentPdfPage)}
        onStop={voiceStopRecording}
        onDelete={voiceDeleteNote}
        onUpdateTitle={voiceUpdateNoteTitle}
      />

      {/* ── Page navigation ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '9px 16px', borderTop: '1px solid var(--border)',
        background: 'var(--bg-panel)', flexShrink: 0,
      }}>
        <button
          onClick={prevPage}
          disabled={virtualIndex <= 0}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: virtualIndex <= 0 ? 'var(--text-3)' : 'var(--text-2)',
            cursor: virtualIndex <= 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
          {isBlankPage ? 'Blank' : `Page ${currentPdfPage}`} • {virtualIndex + 1} / {totalPages}
        </span>
        <button
          onClick={nextPage}
          disabled={virtualIndex >= virtualSequence.length - 1}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: virtualIndex >= virtualSequence.length - 1 ? 'var(--text-3)' : 'var(--text-2)',
            cursor: virtualIndex >= virtualSequence.length - 1 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
