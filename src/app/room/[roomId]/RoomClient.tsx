'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Link2, Check, ChevronLeft, ChevronRight,
  Undo2, MousePointer, Pencil, Eraser, Minus, Plus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchRoom, joinRoom, fetchDrawings, saveRoomDrawing, fetchRoomDrawing } from '@/lib/supabase/db';
import { usePDF } from '@/hooks/usePDF';
import { usePDFDrawings } from '@/hooks/usePDFDrawings';
import { useStudyRoom } from '@/hooks/useStudyRoom';
import { clampZoom } from '@/components/PDFViewer';
import PDFWithDrawing from '@/components/PDFWithDrawing';
import type { DrawingCanvasHandle } from '@/components/PDFWithDrawing';
import { PRESET_COLORS, SIZES } from '@/lib/drawing';
import type { Tool, PenType } from '@/lib/drawing';

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

  // ── Drawing state ─────────────────────────────────────────────────────────
  const [tool, setTool]           = useState<Tool>('pen');
  const [penType, setPenType]     = useState<PenType>('normal');
  const [color, setColor]         = useState('#ededf0');
  const [strokeSize, setStrokeSize] = useState(5);
  const [zoom, setZoom]           = useState(1.0);

  const drawingRef       = useRef<DrawingCanvasHandle | null>(null);
  const docIdRef         = useRef<string | null>(null);
  const currentPageRef   = useRef<number>(1);
  const saveRoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activeDocument, addDocument, goToPage } = usePDF();
  const { getDrawing, saveDrawing, seedDrawings }  = usePDFDrawings();

  const broadcastRef = useRef<(page: number, data: string) => void>(() => {});

  const handleIncomingDrawing = useCallback((pageNumber: number, data: string) => {
    if (currentPageRef.current === pageNumber) {
      drawingRef.current?.loadData?.(data);
    }
  }, []);

  const handleReconnect = useCallback(() => {
    const docId = docIdRef.current;
    if (!docId || !activeDocument) return;
    const page = activeDocument.currentPage;
    const data = getDrawing(docId, page);
    if (data) broadcastRef.current(page, data);
  }, [activeDocument, getDrawing]);

  const { broadcastDrawing, memberCount } = useStudyRoom(
    roomId, handleIncomingDrawing, handleReconnect,
  );

  useEffect(() => { broadcastRef.current = broadcastDrawing; }, [broadcastDrawing]);

  // ── Init ──────────────────────────────────────────────────────────────────
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPage    = activeDocument?.currentPage ?? 1;
  const pageCount      = activeDocument?.pageCount ?? 1;
  const currentDrawing = activeDocument ? getDrawing(activeDocument.id, currentPage) : undefined;

  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  useEffect(() => {
    if (status !== 'ready') return;
    fetchRoomDrawing(roomId, currentPage).then((data) => {
      if (data) drawingRef.current?.loadData?.(data);
    });
  }, [currentPage, status, roomId]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = useCallback((data: string) => {
    if (!activeDocument) return;
    const page = activeDocument.currentPage;
    saveDrawing(activeDocument.id, page, data);
    broadcastDrawing(page, data);
    if (saveRoomTimerRef.current) clearTimeout(saveRoomTimerRef.current);
    saveRoomTimerRef.current = setTimeout(() => {
      saveRoomDrawing(roomId, page, data);
    }, 500);
  }, [activeDocument, saveDrawing, broadcastDrawing, roomId]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  const prevPage = useCallback(() => {
    if (activeDocument) goToPage(Math.max(1, currentPage - 1));
  }, [activeDocument, currentPage, goToPage]);

  const nextPage = useCallback(() => {
    if (activeDocument) goToPage(Math.min(pageCount, currentPage + 1));
  }, [activeDocument, currentPage, pageCount, goToPage]);

  const handleZoomOut = useCallback(() => setZoom((z) => clampZoom(z - 0.1)), []);
  const handleZoomIn  = useCallback(() => setZoom((z) => clampZoom(z + 0.1)), []);

  const selectTool = useCallback((t: Tool, pt?: PenType) => {
    setTool(t);
    if (pt) setPenType(pt);
  }, []);

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

  // ── Room UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-3)', fontSize: 11.5 }}>
          <Users size={12} />
          <span>{memberCount} live</span>
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
        <button
          onClick={() => router.replace('/workspace')}
          style={{
            padding: '4px 11px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: 'transparent', color: 'var(--text-3)',
            border: '1px solid var(--border)', cursor: 'pointer',
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
            {/* Marker icon: thick rectangle */}
            <div style={{ width: 13, height: 5, borderRadius: 2, background: 'currentColor', opacity: 0.75 }} />
            <span>Marker</span>
          </ToolBtn>
          <ToolBtn
            active={tool === 'pen' && penType === 'highlighter'}
            onClick={() => selectTool('pen', 'highlighter')}
            title="Highlighter"
          >
            {/* Highlighter icon: wide flat rectangle */}
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
          {/* Custom color */}
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
        <IconBtn onClick={() => drawingRef.current?.undo?.()} title="Undo last stroke">
          <Undo2 size={13} />
        </IconBtn>
      </div>

      {/* ── PDF viewer ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeDocument && (
          <PDFWithDrawing
            key={`${activeDocument.id}-p${currentPage}`}
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
      </div>

      {/* ── Page navigation ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '9px 16px', borderTop: '1px solid var(--border)',
        background: 'var(--bg-panel)', flexShrink: 0,
      }}>
        <button
          onClick={prevPage}
          disabled={currentPage <= 1}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: currentPage <= 1 ? 'var(--text-3)' : 'var(--text-2)',
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
            background: 'var(--bg-elevated)',
            color: currentPage >= pageCount ? 'var(--text-3)' : 'var(--text-2)',
            cursor: currentPage >= pageCount ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
