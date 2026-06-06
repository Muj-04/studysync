'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Link2, Check, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchRoom, joinRoom, fetchDrawings } from '@/lib/supabase/db';
import { usePDF } from '@/hooks/usePDF';
import { usePDFDrawings } from '@/hooks/usePDFDrawings';
import { useStudyRoom } from '@/hooks/useStudyRoom';
import PDFWithDrawing from '@/components/PDFWithDrawing';
import type { DrawingCanvasHandle } from '@/components/BlankPageCanvas';
import type { Tool, PenType } from '@/lib/drawing';

const COLORS = ['#ededf0', '#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#000000'];

const PEN_TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'cursor', label: 'Cursor' },
  { id: 'pen',    label: 'Pen'    },
  { id: 'eraser', label: 'Eraser' },
];

export default function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [status, setStatus]       = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg]   = useState('');
  const [roomName, setRoomName]   = useState('Study Room');
  const [copied, setCopied]       = useState(false);
  const [tool, setTool]           = useState<Tool>('pen');
  const [penType]                 = useState<PenType>('normal');
  const [color, setColor]         = useState('#ededf0');
  const [strokeSize]              = useState(4);
  const [zoom]                    = useState(1.0);

  const drawingRef = useRef<DrawingCanvasHandle | null>(null);
  const docIdRef   = useRef<string | null>(null);

  const { activeDocument, addDocument, goToPage } = usePDF();
  const { getDrawing, saveDrawing, seedDrawings }  = usePDFDrawings();

  // broadcastRef breaks the circular dep: handleReconnect needs broadcastDrawing,
  // but broadcastDrawing comes from useStudyRoom which needs handleReconnect.
  const broadcastRef = useRef<(page: number, data: string) => void>(() => {});

  const handleIncomingDrawing = useCallback((pageNumber: number, data: string) => {
    const docId = docIdRef.current;
    if (!docId) return;
    seedDrawings({ [`${docId}:${pageNumber}`]: data });
  }, [seedDrawings]);

  // Re-broadcast the current page's drawing so other members get the latest
  // state immediately after a reconnect.
  const handleReconnect = useCallback(() => {
    const docId = docIdRef.current;
    if (!docId || !activeDocument) return;
    const page = activeDocument.currentPage;
    const data = getDrawing(docId, page);
    if (data) broadcastRef.current(page, data);
  }, [activeDocument, getDrawing]);

  const { broadcastDrawing, memberCount } = useStudyRoom(roomId, handleIncomingDrawing, handleReconnect);

  // Keep broadcastRef in sync (broadcastDrawing is stable but this is defensive).
  useEffect(() => { broadcastRef.current = broadcastDrawing; }, [broadcastDrawing]);

  // ── Init: auth check → fetch room → download PDF → seed drawings ────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

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
      const { id: docId } = await addDocument(file);
      docIdRef.current = docId;

      // Seed own saved drawings for this doc
      const remoteDrawings = await fetchDrawings(docId);
      const prefixed: Record<string, string> = {};
      for (const [k, v] of Object.entries(remoteDrawings)) prefixed[`${docId}:${k}`] = v;
      if (Object.keys(prefixed).length > 0) seedDrawings(prefixed);

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

  // ── Derived ─────────────────────────────────────────────────────────────────
  const currentPage   = activeDocument?.currentPage ?? 1;
  const pageCount     = activeDocument?.pageCount ?? 1;
  const currentDrawing = activeDocument ? getDrawing(activeDocument.id, currentPage) : undefined;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback((data: string) => {
    if (!activeDocument) return;
    const page = activeDocument.currentPage;
    saveDrawing(activeDocument.id, page, data);
    broadcastDrawing(page, data);
  }, [activeDocument, saveDrawing, broadcastDrawing]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  const prevPage = useCallback(() => { if (activeDocument) goToPage(Math.max(1, currentPage - 1)); }, [activeDocument, currentPage, goToPage]);
  const nextPage = useCallback(() => { if (activeDocument) goToPage(Math.min(pageCount, currentPage + 1)); }, [activeDocument, currentPage, pageCount, goToPage]);

  // ── Loading / error screens ──────────────────────────────────────────────────
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

  // ── Main room UI ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {roomName}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', fontSize: 12 }}>
          <Users size={13} />
          <span>{memberCount} live</span>
        </div>

        <button
          onClick={copyLink}
          title="Copy room link"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: copied ? 'var(--green-muted, #14532d22)' : 'var(--bg-elevated)',
            color: copied ? 'var(--green, #4ade80)' : 'var(--text-2)',
            border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {copied ? <Check size={12} /> : <Link2 size={12} />}
          {copied ? 'Copied!' : 'Share link'}
        </button>

        <button
          onClick={() => router.replace('/workspace')}
          style={{
            padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: 'transparent', color: 'var(--text-3)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          Leave
        </button>
      </div>

      {/* ── Drawing toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Tool buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PEN_TOOLS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              title={label}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: tool === id ? 'var(--accent)' : 'var(--bg-elevated)',
                color: tool === id ? '#fff' : 'var(--text-2)',
                border: '1px solid ' + (tool === id ? 'transparent' : 'var(--border)'),
                cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Color swatches */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              style={{
                width: 20, height: 20, borderRadius: '50%', background: c,
                border: color === c ? '2px solid var(--accent)' : '2px solid var(--border)',
                cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.12s',
              }}
            />
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Undo */}
        <button
          onClick={() => drawingRef.current?.undo?.()}
          title="Undo last stroke"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--bg-elevated)', color: 'var(--text-2)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          <Undo2 size={13} />
        </button>
      </div>

      {/* ── PDF viewer ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeDocument && (
          <PDFWithDrawing
            ref={drawingRef}
            document={activeDocument}
            tool={tool}
            penType={penType}
            color={color}
            strokeSize={strokeSize}
            savedData={currentDrawing}
            onSave={handleSave}
            zoom={zoom}
            interactive={tool !== 'cursor'}
          />
        )}
      </div>

      {/* ── Page navigation ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '10px 16px', borderTop: '1px solid var(--border)',
        background: 'var(--bg-panel)', flexShrink: 0,
      }}>
        <button
          onClick={prevPage}
          disabled={currentPage <= 1}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)', color: currentPage <= 1 ? 'var(--text-3)' : 'var(--text-2)',
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={15} />
        </button>

        <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 80, textAlign: 'center' }}>
          Page {currentPage} / {pageCount}
        </span>

        <button
          onClick={nextPage}
          disabled={currentPage >= pageCount}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)', color: currentPage >= pageCount ? 'var(--text-3)' : 'var(--text-2)',
            cursor: currentPage >= pageCount ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
