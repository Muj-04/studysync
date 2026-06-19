'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Link2, Check, ChevronLeft, ChevronRight,
  MousePointer, Pencil, Eraser, Minus, Plus,
  ChevronDown, FilePlus, UserPlus, UserCheck, X as XIcon,
  Mic, MicOff, Upload,
} from 'lucide-react';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { createClient } from '@/lib/supabase/client';
import {
  fetchRoom, joinRoom, leaveRoom, closeRoom,
  saveRoomDrawing, fetchAllRoomDrawings,
  fetchRoomVoiceNotes, fetchSingleRoomVoiceNote,
  saveRoomBlankPage, fetchRoomBlankPages,
  getProfile, getFriends, inviteToRoom,
} from '@/lib/supabase/db';
import type { FriendEntry } from '@/lib/supabase/db';
import { usePDF } from '@/hooks/usePDF';
import { usePDFDrawings } from '@/hooks/usePDFDrawings';
import { useStudyRoom } from '@/hooks/useStudyRoom';
import type { RoomVoiceNotePayload, RoomBlankPagePayload } from '@/hooks/useStudyRoom';
import { useRoomVoiceNotes } from '@/hooks/useRoomVoiceNotes';
import { clampZoom } from '@/components/PDFViewer';
import NotificationBell from '@/components/NotificationBell';
import { useLanguage } from '@/contexts/LanguageContext';
import PDFScrollViewer from '@/components/PDFScrollViewer';
import VoiceNotesSheet from '@/components/VoiceNotesSheet';
import { PRESET_COLORS } from '@/lib/drawing';
import DragScrubber from '@/components/DragScrubber';
import type { Tool, PenType } from '@/lib/drawing';
import type { BlankPage } from '@/types';
import { KEYS, storageGet, storageSet } from '@/lib/storage';
import { useAuthGuard } from '@/hooks/useAuthGuard';

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

const BG_THEME_DEFS = [
  { theme: 'white' as const, bg: '#ffffff',  dotColor: 'rgba(0,0,0,0.15)' },
  { theme: 'dark'  as const, bg: '#1e1e2e',  dotColor: 'rgba(255,255,255,0.18)' },
];

// ── Member avatar chip ────────────────────────────────────────────────────────

function MemberAvatar({ name, avatarUrl, isSpeaking, isVip }: { name: string; avatarUrl?: string; isSpeaking?: boolean; isVip?: boolean }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');
  const border = isVip ? '1.5px solid transparent' : (isSpeaking ? '1.5px solid #22c55e' : '1.5px solid var(--bg-panel)');
  return (
    <div title={name} style={{ position: 'relative', marginLeft: -6, flexShrink: 0, width: 24, height: 24 }}>
      {isVip && (
        <div style={{
          position: 'absolute', top: -2, left: -2, width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700, #FFA500)',
          backgroundSize: '200% 200%', animation: 'vip-shimmer 2.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 24, height: 24, borderRadius: '50%',
        background: avatarUrl ? 'transparent' : 'var(--accent)', color: '#fff',
        fontSize: 9.5, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        border,
        overflow: 'hidden',
        boxShadow: isSpeaking && !isVip ? '0 0 0 2px rgba(34,197,94,0.35)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (initials || '?')}
      </div>
      {isVip && (
        <span style={{
          position: 'absolute', bottom: -3, right: -3, zIndex: 2,
          background: '#FFD700', color: '#000', fontWeight: 800,
          fontSize: 5.5, padding: '1px 2.5px', borderRadius: 2,
          lineHeight: 1.3, pointerEvents: 'none',
        }}>VIP</span>
      )}
    </div>
  );
}

// ── Voice waveform bars (shown when speaking) ─────────────────────────────────

function VoiceWaveform({ speaking, size = 10 }: { speaking: boolean; size?: number }) {
  const bars = [0, 0.12, 0.24, 0.12];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      height: size, width: size + 4,
    }}>
      {bars.map((delay, i) => (
        <div key={i} style={{
          width: 2, height: '100%',
          background: speaking ? '#22c55e' : 'var(--text-3)',
          borderRadius: 1,
          transformOrigin: 'center',
          transform: speaking ? undefined : 'scaleY(0.35)',
          animation: speaking ? `voice-bar 0.55s ease-in-out ${delay}s infinite` : 'none',
          transition: 'background 0.2s',
        }} />
      ))}
    </div>
  );
}

// ── Toolbar primitives ────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 22, background: '#333333', flexShrink: 0 }} />;
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
        borderRadius: 4, fontSize: 12, fontWeight: 500,
        background: active ? '#3a3a3a' : '#222222',
        color: '#ffffff',
        border: `1px solid ${active ? '#555555' : '#333333'}`,
        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        transition: 'background 0.12s, border-color 0.12s',
        whiteSpace: 'nowrap',
      }}
      onMouseOver={(e) => { if (!active) Object.assign(e.currentTarget.style, { background: '#2a2a2a', borderColor: '#444444' }); }}
      onMouseOut={(e)  => { if (!active) Object.assign(e.currentTarget.style, { background: '#222222', borderColor: '#333333' }); }}
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
        width: 30, height: 30, borderRadius: 4,
        background: '#222222',
        border: '1px solid #333333',
        color: disabled ? '#555555' : '#ffffff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, flexShrink: 0,
        transition: 'background 0.12s',
      }}
      onMouseOver={(e) => { if (!disabled) Object.assign(e.currentTarget.style, { background: '#2a2a2a' }); }}
      onMouseOut={(e)  => { if (!disabled) Object.assign(e.currentTarget.style, { background: '#222222' }); }}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RoomClient({ roomId }: { roomId: string }) {
  useAuthGuard();
  const router = useRouter();
  const { t } = useLanguage();

  const BG_THEMES = [
    { ...BG_THEME_DEFS[0], label: t('room_bg_white') },
    { ...BG_THEME_DEFS[1], label: t('room_bg_dark') },
  ];
  const [status, setStatus]     = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [planBlocked, setPlanBlocked] = useState(false);
  const [roomName, setRoomName] = useState('Study Room');
  const [copied, setCopied]       = useState(false);
  const [userName, setUserName]   = useState('');
  const [userId, setUserId]       = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | undefined>(undefined);
  const [userIsVip, setUserIsVip] = useState(false);
  const [hostUserId, setHostUserId]   = useState('');
  const [maxMembers, setMaxMembers]   = useState(10);
  const [expiresAt, setExpiresAt]     = useState<string | null>(null);
  const [timeLeft, setTimeLeft]       = useState('');
  const [endRoomConfirm, setEndRoomConfirm] = useState(false);

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
  const [virtualIndex, setVirtualIndex]   = useState(0);
  const [blankMenuOpen, setBlankMenuOpen] = useState(false);
  const [docChangePrompt, setDocChangePrompt] = useState<{ uploaderName: string; fileName: string } | null>(null);
  const pendingBlankIdRef = useRef<string | null>(null);
  const changePdfInputRef = useRef<HTMLInputElement>(null);

  // ── Invite friends state ──────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen]     = useState(false);
  const [friendsList, setFriendsList]   = useState<FriendEntry[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [invitedIds, setInvitedIds]     = useState<Set<string>>(new Set());

  const hasJoinedRef    = useRef(false);
  const docIdRef        = useRef<string | null>(null);
  const currentPageRef  = useRef<number>(1);
  const currentVPRef    = useRef<VirtualPage | null>(null);
  const saveRoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Refs to wire useStudyRoom callbacks → useRoomVoiceNotes (defined after hooks)
  const addIncomingNoteRef    = useRef<((p: RoomVoiceNotePayload) => void) | null>(null);
  const removeIncomingNoteRef = useRef<((id: string) => void) | null>(null);
  const seedNotesRef          = useRef<((remote: Parameters<ReturnType<typeof useRoomVoiceNotes>['seedNotes']>[0]) => void) | null>(null);

  const { activeDocument, addDocument, removeDocument, goToPage } = usePDF();
  const { getDrawing, saveDrawing }  = usePDFDrawings();

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
    if (docIdRef.current) saveDrawing(docIdRef.current, pageNumber, data);
  }, [saveDrawing]);

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

  const handleIncomingBlankDrawing = useCallback((_pageId: string, _data: string) => {}, []);

  const handleIncomingDocChange = useCallback((uploaderName: string, fileName: string) => {
    setDocChangePrompt({ uploaderName, fileName });
  }, []);

  const myPresence = useMemo(
    () => ({ userId, name: userName, avatarUrl: userAvatarUrl, isVip: userIsVip }),
    [userId, userName, userAvatarUrl, userIsVip],
  );

  const handleRoomClosed = useCallback(() => {
    setErrorMsg(t('room_ended_redirect'));
    setStatus('error');
    setTimeout(() => router.replace('/workspace'), 3000);
  }, [router]);

  const {
    broadcastDrawing, broadcastBlankDrawing,
    broadcastVoiceNoteAdded, broadcastVoiceNoteDelete,
    broadcastBlankPageAdded, broadcastRoomClosed,
    broadcastDocChanged,
    memberCount, members,
  } = useStudyRoom(
    roomId, handleIncomingDrawing, handleReconnect,
    handleIncomingVoiceNoteAdded, handleIncomingVoiceNoteDelete,
    handleIncomingBlankPage, myPresence,
    handleIncomingBlankDrawing, handleRoomClosed,
    handleIncomingDocChange,
  );

  useEffect(() => { broadcastRef.current = broadcastDrawing; }, [broadcastDrawing]);

  const {
    connected: voiceConnected,
    connecting: voiceConnecting,
    muted: voiceMuted,
    speakingIds,
    voiceError,
    join: voiceJoin,
    leave: voiceLeave,
    toggleMute: voiceToggleMute,
  } = useVoiceChat(roomId, userId, userName);

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

      const profile = await getProfile();
      const name = profile?.username
        ?? (user.user_metadata?.full_name as string | undefined)
        ?? (user.user_metadata?.name as string | undefined)
        ?? user.email?.split('@')[0]
        ?? 'Member';
      setUserName(name);
      setUserId(user.id);
      if (profile?.avatarUrl) setUserAvatarUrl(profile.avatarUrl);
      if (profile?.isVip) setUserIsVip(true);

      // Block free-plan users — VIP bypasses
      const isVip = profile?.isVip ?? false;
      const plan  = profile?.plan ?? 'free';
      if (!isVip && plan === 'free') { setPlanBlocked(true); return; }

      const room = await fetchRoom(roomId);
      if (!room) { setErrorMsg(t('room_not_found')); setStatus('error'); return; }
      if (room.status === 'closed') { setErrorMsg(t('room_ended_msg')); setStatus('error'); return; }
      if (room.expiresAt && new Date(room.expiresAt) < new Date()) {
        closeRoom(roomId).catch(() => {});
        setErrorMsg(t('room_expired_msg')); setStatus('error'); return;
      }
      setRoomName(room.documentName);
      setHostUserId(room.hostUserId);
      setMaxMembers(room.maxMembers);
      setExpiresAt(room.expiresAt);

      const { data: signed, error: signErr } = await supabase.storage
        .from('pdfs').createSignedUrl(room.pdfPath, 3600);
      if (signErr || !signed?.signedUrl) {
        setErrorMsg(t('room_pdf_deleted'));
        setStatus('error'); return;
      }

      const resp = await fetch(signed.signedUrl);
      if (!resp.ok) { setErrorMsg(t('room_pdf_failed')); setStatus('error'); return; }

      const blob = await resp.blob();
      const file = new File([blob], room.documentName + '.pdf', { type: 'application/pdf' });
      const { id: newDocId } = await addDocument(file);
      docIdRef.current = newDocId;
      if (!cancelled) setDocId(newDocId);

      // Clear any workspace drawings for this docId so they don't bleed into the room
      const existingDrawings = storageGet<Record<string, string>>(KEYS.DRAWINGS) ?? {};
      const prefix = `${newDocId}:`;
      const filteredDrawings = Object.fromEntries(
        Object.entries(existingDrawings).filter(([k]) => !k.startsWith(prefix))
      );
      storageSet(KEYS.DRAWINGS, filteredDrawings);

      const [remoteVoiceNotes, remoteBlankPages, remoteDrawings] = await Promise.all([
        fetchRoomVoiceNotes(roomId),
        fetchRoomBlankPages(roomId),
        fetchAllRoomDrawings(roomId),
      ]);

      if (remoteVoiceNotes.length > 0 && !cancelled) {
        seedNotesRef.current?.(remoteVoiceNotes);
      }

      if (remoteBlankPages.length > 0 && !cancelled) {
        setRoomBlankPages(remoteBlankPages);
      }

      if (remoteDrawings.length > 0 && !cancelled) {
        remoteDrawings.forEach(({ pageNumber, data }) => {
          saveDrawing(newDocId, pageNumber, data);
        });
      }

      const joinResult = await joinRoom(roomId);
      if (joinResult.error === 'full') {
        setErrorMsg(`This room is full (${room.maxMembers}/${room.maxMembers} members).`);
        setStatus('error'); return;
      }
      if (joinResult.error === 'closed') {
        setErrorMsg('This room has been closed.'); setStatus('error'); return;
      }
      if (!cancelled) hasJoinedRef.current = true;
      if (!cancelled) {
        setStatus('ready');
        // Let friends page know which room is active
        try {
          localStorage.setItem('activeRoom', JSON.stringify({ roomId, roomName: room.documentName, timestamp: Date.now() }));
        } catch { /* ignore */ }
      }
    }
    init().catch((e) => {
      console.error('[Room] init error:', e);
      setErrorMsg('Something went wrong loading the room.');
      setStatus('error');
    });
    return () => {
      cancelled = true;
      if (hasJoinedRef.current) {
        hasJoinedRef.current = false;
        leaveRoom(roomId).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPdfPage = currentVP?.type === 'pdf' ? currentVP.pdfPage : (activeDocument?.currentPage ?? 1);
  const totalPages     = virtualSequence.length || (activeDocument?.pageCount ?? 1);
  const isBlankPage    = currentVP?.type === 'blank';

  useEffect(() => { currentPageRef.current = currentPdfPage; }, [currentPdfPage]);

  // Time-left ticker
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setTimeLeft('Expired'); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setTimeLeft(h > 0 ? `${h}h ${m}m left` : `${m}m left`);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Auto-expire: close room when timer hits 0
  useEffect(() => {
    if (!expiresAt || status !== 'ready') return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      closeRoom(roomId).catch(() => {});
      broadcastRoomClosed();
      setErrorMsg(t('room_expired_msg')); setStatus('error'); return;
    }
    const timer = setTimeout(async () => {
      await closeRoom(roomId).catch(() => {});
      broadcastRoomClosed();
      setErrorMsg(t('room_expired_msg')); setStatus('error');
    }, ms);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, status]);

  // Pagehide: best-effort leave on browser close/refresh
  useEffect(() => {
    const handleUnload = () => {
      if (hasJoinedRef.current) {
        hasJoinedRef.current = false;
        leaveRoom(roomId).catch(() => {});
      }
    };
    window.addEventListener('pagehide', handleUnload);
    return () => window.removeEventListener('pagehide', handleUnload);
  }, [roomId]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSavePageDrawing = useCallback((docId: string, page: number, data: string) => {
    saveDrawing(docId, page, data);
    broadcastDrawing(page, data);
    if (saveRoomTimerRef.current) clearTimeout(saveRoomTimerRef.current);
    saveRoomTimerRef.current = setTimeout(() => {
      saveRoomDrawing(roomId, page, data);
    }, 500);
  }, [saveDrawing, broadcastDrawing, roomId]);

  const handlePdfFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const isResponding = docChangePrompt !== null;
    const oldDocId = docIdRef.current;
    if (oldDocId) removeDocument(oldDocId);
    const { id: newDocId } = await addDocument(file);
    docIdRef.current = newDocId;
    setDocId(newDocId);
    setVirtualIndex(0);
    setRoomBlankPages([]);
    const remoteDrawings = await fetchAllRoomDrawings(roomId);
    remoteDrawings.forEach(({ pageNumber, data }) => saveDrawing(newDocId, pageNumber, data));
    if (!isResponding) broadcastDocChanged(userName, file.name);
    setDocChangePrompt(null);
  }, [docChangePrompt, removeDocument, addDocument, saveDrawing, roomId, broadcastDocChanged, userName]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  const handleLeave = useCallback(async () => {
    if (hasJoinedRef.current) {
      hasJoinedRef.current = false;
      const { wasLastMember } = await leaveRoom(roomId);
      if (wasLastMember) broadcastRoomClosed();
    }
    try { localStorage.removeItem('activeRoom'); } catch { /* */ }
    router.replace('/workspace');
  }, [roomId, broadcastRoomClosed, router]);

  const handleEndRoom = useCallback(async () => {
    setEndRoomConfirm(false);
    hasJoinedRef.current = false;
    await closeRoom(roomId);
    broadcastRoomClosed();
    try { localStorage.removeItem('activeRoom'); } catch { /* */ }
    router.replace('/workspace');
  }, [roomId, broadcastRoomClosed, router]);

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

  // Open invite modal — lazy-load friends on first open
  const handleOpenInvite = useCallback(async () => {
    setInviteOpen(true);
    if (friendsList.length === 0) {
      setFriendsLoading(true);
      const list = await getFriends();
      setFriendsList(list);
      setFriendsLoading(false);
    }
  }, [friendsList.length]);

  const handleInviteFriend = useCallback(async (friendId: string) => {
    await inviteToRoom(friendId, roomId, roomName);
    setInvitedIds((prev) => new Set([...prev, friendId]));
  }, [roomId, roomName]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (planBlocked) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
        padding: 24, textAlign: 'center',
      }}>
        <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {t('room_premium_required')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, maxWidth: 360, lineHeight: 1.6 }}>
          {t('room_premium_body')}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={() => router.replace('/workspace')}
            style={{
              padding: '8px 20px', borderRadius: 4, fontSize: 13, fontWeight: 500,
              background: 'var(--bg-elevated)', color: 'var(--text-2)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >
            {t('room_back_workspace')}
          </button>
          <a
            href="/pricing"
            style={{
              padding: '8px 20px', borderRadius: 4, fontSize: 13, fontWeight: 600,
              background: '#ffffff', color: '#0f172a',
              border: 'none', cursor: 'pointer', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            {t('room_upgrade_now')}
          </a>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg-app)', color: 'var(--text-2)', fontFamily: 'inherit',
      }}>
        <div className="spinner" style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
        }} />
        <p style={{ fontSize: 14, margin: 0 }}>{t('room_loading')}</p>
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
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{t('room_error_title')}</p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{errorMsg}</p>
        <button
          onClick={() => router.replace('/workspace')}
          style={{
            marginTop: 8, padding: '8px 20px', borderRadius: 4, fontSize: 13,
            background: '#ffffff', color: '#0f172a', border: 'none', cursor: 'pointer',
          }}
        >
          {t('room_back_ws')}
        </button>
      </div>
    );
  }

  // ── Derived for voice notes ───────────────────────────────────────────────
  const pageNotes = voiceGetNotesForPage(currentPdfPage);
  const pageKey   = `${roomId}:${currentPdfPage}`;

  // ── Members display ───────────────────────────────────────────────────────
  const visibleMembers = members.slice(0, 3);
  const hiddenCount    = members.length > 3 ? members.length - 3 : 0;

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
        padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {roomName}
        </span>

        {/* Time remaining */}
        {timeLeft && (
          <span style={{
            fontSize: 11, fontWeight: 500, color: timeLeft === 'Expired' ? '#ef4444' : 'var(--text-3)',
            whiteSpace: 'nowrap', flexShrink: 0,
            padding: '2px 8px', borderRadius: 9999,
            background: timeLeft === 'Expired' ? 'rgba(239,68,68,0.12)' : 'var(--bg-elevated)',
            border: `1px solid ${timeLeft === 'Expired' ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
          }}>
            {timeLeft}
          </span>
        )}

        {/* Member avatars + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {members.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
              {visibleMembers.map((m, i) => (
                <MemberAvatar key={m.userId || i} name={m.name} avatarUrl={m.avatarUrl} isSpeaking={speakingIds.has(m.userId)} isVip={m.isVip} />
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
            {memberCount}/{maxMembers} {t('room_live')}
          </span>
        </div>

        <NotificationBell />

        {/* Invite Friends */}
        <button
          onClick={handleOpenInvite}
          title="Invite a friend"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 11px', borderRadius: 4, fontSize: 12, fontWeight: 500,
            background: 'var(--bg-elevated)', color: 'var(--text-2)',
            border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' })}
        >
          <UserPlus size={12} /> {t('room_invite')}
        </button>

        <button
          onClick={copyLink}
          title="Copy room link"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 11px', borderRadius: 4, fontSize: 12, fontWeight: 500,
            background: copied ? 'var(--green-muted, #14532d22)' : 'var(--bg-elevated)',
            color: copied ? 'var(--green, #4ade80)' : 'var(--text-2)',
            border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {copied ? <Check size={12} /> : <Link2 size={12} />}
          {copied ? t('room_copied') : t('room_share_link')}
        </button>

        {/* Host-only: End Room button */}
        {userId === hostUserId && (
          <button
            onClick={() => setEndRoomConfirm(true)}
            style={{
              padding: '4px 11px', borderRadius: 4, fontSize: 12, fontWeight: 500,
              background: 'rgba(239,68,68,0.18)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.5)', cursor: 'pointer',
              transition: 'background 0.13s, border-color 0.13s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.3)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
          >
            {t('room_end_room_btn')}
          </button>
        )}

        {/* Leave button */}
        <button
          onClick={handleLeave}
          style={{
            padding: '4px 11px', borderRadius: 4, fontSize: 12, fontWeight: 500,
            background: 'rgba(239,68,68,0.12)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer',
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
          {t('room_leave')}
        </button>
      </div>

      {/* ── Drawing toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderBottom: '1px solid #333333',
        background: '#1a1a1a',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        flexShrink: 0, flexWrap: 'wrap',
        rowGap: 6,
      }}>

        {/* ── Tools ── */}
        <div style={{ display: 'flex', gap: 3 }}>
          <ToolBtn active={tool === 'cursor'} onClick={() => selectTool('cursor')} title={t('room_cursor')}>
            <MousePointer size={13} />
            <span>{t('room_cursor')}</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'normal'}
            onClick={() => selectTool('pen', 'normal')}
            title={t('room_pen')}
          >
            <Pencil size={13} />
            <span>{t('room_pen')}</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'marker'}
            onClick={() => selectTool('pen', 'marker')}
            title={t('room_marker')}
          >
            <div style={{ width: 13, height: 5, borderRadius: 2, background: 'currentColor', opacity: 0.75 }} />
            <span>{t('room_marker')}</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'highlighter'}
            onClick={() => selectTool('pen', 'highlighter')}
            title={t('room_highlight')}
          >
            <div style={{ width: 13, height: 8, borderRadius: 2, background: 'currentColor', opacity: 0.4 }} />
            <span>{t('room_highlight')}</span>
          </ToolBtn>
          <ToolBtn active={tool === 'eraser'} onClick={() => selectTool('eraser')} title={t('room_eraser')}>
            <Eraser size={13} />
            <span>{t('room_eraser')}</span>
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
        <DragScrubber value={strokeSize} onChange={setStrokeSize} label="Size" width={110} />

        <Divider />

        {/* ── Zoom ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <IconBtn onClick={handleZoomOut} title={t('room_zoom_out')} disabled={zoom <= 0.5}>
            <Minus size={12} />
          </IconBtn>
          <span style={{
            fontSize: 11.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace',
            minWidth: 36, textAlign: 'center', flexShrink: 0,
          }}>
            {Math.round(zoom * 100)}%
          </span>
          <IconBtn onClick={handleZoomIn} title={t('room_zoom_in')} disabled={zoom >= 2.0}>
            <Plus size={12} />
          </IconBtn>
        </div>

        <Divider />

        {/* ── Add Blank Page ── */}
        <div style={{ position: 'relative' }} data-blank-menu>
          <button
            onClick={() => setBlankMenuOpen((o) => !o)}
            title={t('room_add_blank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 9px',
              borderRadius: 4, fontSize: 12, fontWeight: 500,
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
            <span>{t('room_blank')}</span>
            <ChevronDown size={9} strokeWidth={2.5} style={{ opacity: 0.6 }} />
          </button>

          {blankMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: 'var(--bg-panel)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, padding: 10,
              zIndex: 200,
            }}>
              <p style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8, margin: '0 0 8px',
              }}>
                {t('room_background')}
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                {BG_THEMES.map(({ theme, label, bg, dotColor }) => (
                  <button
                    key={theme}
                    onClick={() => handleAddBlankPage(theme)}
                    title={`Add ${label} blank page`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      border: '1px solid var(--border)', borderRadius: 4, padding: '5px 6px',
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

        <Divider />

        {/* ── Voice chat ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={voiceConnected ? voiceLeave : voiceJoin}
            disabled={voiceConnecting}
            title={voiceConnected ? t('room_voice_in') : t('room_voice_chat')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 30, padding: '0 9px',
              borderRadius: 4, fontSize: 12, fontWeight: 500,
              background: voiceConnected ? 'rgba(34,197,94,0.15)' : 'var(--bg-elevated)',
              color: voiceConnected ? '#22c55e' : 'var(--text-2)',
              border: `1px solid ${voiceConnected ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
              cursor: voiceConnecting ? 'wait' : 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
              transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              opacity: voiceConnecting ? 0.7 : 1,
            }}
          >
            {voiceConnecting
              ? <span className="spinner" style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', display: 'inline-block' }} />
              : <Mic size={12} />
            }
            <span>{voiceConnected ? t('room_voice_in') : voiceConnecting ? t('room_voice_joining') : t('room_voice_chat')}</span>
            {voiceConnected && <VoiceWaveform speaking={speakingIds.size > 0} size={10} />}
          </button>

          {voiceConnected && (
            <button
              onClick={voiceToggleMute}
              title={voiceMuted ? t('room_unmute') : t('room_mute')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 4,
                background: voiceMuted ? 'rgba(239,68,68,0.15)' : 'var(--bg-elevated)',
                color: voiceMuted ? '#ef4444' : 'var(--text-2)',
                border: `1px solid ${voiceMuted ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
            >
              {voiceMuted ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
          )}
        </div>

        <Divider />

        {/* ── Change PDF ── */}
        <button
          onClick={() => changePdfInputRef.current?.click()}
          title="Upload a different PDF"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 30, padding: '0 9px',
            borderRadius: 4, fontSize: 12, fontWeight: 500,
            background: 'var(--bg-elevated)', color: 'var(--text-2)',
            border: '1px solid var(--border)', cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' })}
        >
          <Upload size={13} />
          <span>Change PDF</span>
        </button>
        <input
          ref={changePdfInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handlePdfFileChange}
        />
      </div>

      {/* ── Doc change notification banner ── */}
      {docChangePrompt && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', flexShrink: 0,
          background: 'rgba(59,130,246,0.1)',
          borderBottom: '1px solid rgba(59,130,246,0.3)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
              {docChangePrompt.uploaderName} uploaded a new document:
            </span>
            <span style={{ fontSize: 13, color: 'var(--accent)', marginLeft: 6, fontWeight: 500 }}>
              {docChangePrompt.fileName}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>
              — Upload the same file to view it in the room.
            </span>
          </div>
          <button
            onClick={() => changePdfInputRef.current?.click()}
            style={{
              padding: '5px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              background: 'rgba(59,130,246,0.88)', color: '#fff',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            Upload File
          </button>
          <button
            onClick={() => setDocChangePrompt(null)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 4,
              background: 'none', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* ── PDF / blank page viewer ── */}
      <div ref={pdfContainerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeDocument && virtualSequence.length > 0 && (
          <PDFScrollViewer
            document={activeDocument}
            virtualPages={virtualSequence}
            currentVirtualIndex={virtualIndex}
            onPageChange={setVirtualIndex}
            zoom={zoom}
            getNotesForPage={(_docId, pageId) => voiceGetNotesForPage(typeof pageId === 'number' ? pageId : 0)}
            isRecording={voiceIsRecording}
            recordingContext={voiceRecordingContext && activeDocument ? { documentId: activeDocument.id, pageNumber: voiceRecordingContext.pageNumber } : null}
            onRecordStart={(_docId, pageId) => voiceStartRecording(typeof pageId === 'number' ? pageId : 0)}
            onRecordStop={voiceStopRecording}
            tool={tool}
            penType={penType}
            color={color}
            strokeSize={strokeSize}
            annotationActive={tool !== 'cursor'}
            getDrawing={getDrawing}
            saveDrawing={handleSavePageDrawing}
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
        padding: '9px 16px', borderTop: '1px solid rgba(255,255,255,0.1)',
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        <button
          onClick={prevPage}
          disabled={virtualIndex <= 0}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 4, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: virtualIndex <= 0 ? 'var(--text-3)' : 'var(--text-2)',
            cursor: virtualIndex <= 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
          {isBlankPage ? t('room_page_blank') : `Page ${currentPdfPage}`} • {virtualIndex + 1} / {totalPages}
        </span>
        <button
          onClick={nextPage}
          disabled={virtualIndex >= virtualSequence.length - 1}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 4, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: virtualIndex >= virtualSequence.length - 1 ? 'var(--text-3)' : 'var(--text-2)',
            cursor: virtualIndex >= virtualSequence.length - 1 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* ── Voice error toast ── */}
      {voiceError && (
        <div style={{
          position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
          color: '#ef4444', fontSize: 12, fontWeight: 500, padding: '8px 16px',
          borderRadius: 4, zIndex: 400, whiteSpace: 'nowrap',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}>
          {voiceError}
        </div>
      )}

      {/* ── End Room confirm modal ── */}
      {endRoomConfirm && (
        <div
          onClick={() => setEndRoomConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, padding: '24px',
              background: 'var(--bg-panel)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
              {t('room_end_title')}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 20px' }}>
              {t('room_end_body')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEndRoomConfirm(false)}
                style={{
                  padding: '6px 16px', borderRadius: 4, fontSize: 13, fontWeight: 500,
                  background: 'var(--bg-elevated)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('common_cancel')}
              </button>
              <button
                onClick={handleEndRoom}
                style={{
                  padding: '6px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600,
                  background: '#ef4444', color: '#fff',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('room_end_room_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite Friends modal ── */}
      {inviteOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setInviteOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="animate-scale-in"
            style={{
              width: '100%', maxWidth: 400,
              background: 'var(--bg-panel)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{t('room_invite_friends_title')}</span>
              <button
                onClick={() => setInviteOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}
              >
                <XIcon size={15} />
              </button>
            </div>

            {/* Friends list */}
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {friendsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <span className="spinner" style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', display: 'block' }} />
                </div>
              ) : friendsList.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  <UserPlus size={28} style={{ margin: '0 auto 10px', opacity: 0.35, display: 'block' }} />
                  {t('room_no_friends')}
                </div>
              ) : (
                friendsList.map((f) => {
                  const sent = invitedIds.has(f.userId);
                  const displayN = f.username || 'Unknown';
                  const initials = displayN.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');
                  return (
                    <div key={f.userId} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: f.avatarUrl ? 'transparent' : 'var(--accent)', color: '#fff',
                        fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      }}>
                        {f.avatarUrl
                          ? <img src={f.avatarUrl} alt={displayN} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials || '?'}
                      </div>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayN}
                      </span>
                      <button
                        onClick={() => handleInviteFriend(f.userId)}
                        disabled={sent}
                        style={{
                          height: 28, padding: '0 12px', borderRadius: 4,
                          background: sent ? 'var(--bg-elevated)' : 'var(--accent)',
                          color: sent ? 'var(--text-3)' : '#fff',
                          border: sent ? '1px solid var(--border)' : 'none',
                          fontSize: 12, fontWeight: 600, cursor: sent ? 'default' : 'pointer',
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'background 0.12s',
                        }}
                      >
                        {sent ? <><UserCheck size={12} /> {t('room_sent_btn')}</> : <><UserPlus size={12} /> {t('room_invite_btn')}</>}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
              <a
                href="/friends"
                target="_blank"
                style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
              >
                {t('room_manage_friends')}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
