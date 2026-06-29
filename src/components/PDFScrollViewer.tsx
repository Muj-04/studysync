'use client';
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFDocument, VoiceNote, BlankPage, TextNote } from '@/types';
import type { Tool, PenType } from '@/lib/drawing';
import { getDrawingCursor } from '@/lib/drawing';
import { Mic, Plus, Square } from 'lucide-react';
import TextNotesLayer from './TextNotesLayer';
import type { RoomStrokePayload } from '@/lib/supabase/db';

// ── Types ─────────────────────────────────────────────────────────────────────

type VirtualPage =
  | { type: 'pdf'; pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

// ── PDFJS singleton ───────────────────────────────────────────────────────────

let pdfjsLib: typeof import('pdfjs-dist') | null = null;
async function getPDFJS() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  pdfjsLib = pdfjs;
  return pdfjs;
}

// ── Document cache ────────────────────────────────────────────────────────────

const docCache = new Map<string, Promise<PDFDocumentProxy>>();
async function getDocProxy(url: string): Promise<PDFDocumentProxy> {
  if (!docCache.has(url)) {
    const pdfjs = await getPDFJS();
    docCache.set(url, pdfjs.getDocument(url).promise);
  }
  return docCache.get(url)!;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function applyCtx(
  ctx: CanvasRenderingContext2D,
  tool: Tool,
  penType: PenType,
  color: string,
  strokeSize: number,
) {
  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = strokeSize * 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else if (penType === 'normal') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else if (penType === 'marker') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeSize * 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else {
    // highlighter
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeSize * 7;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
  }
}

// Replay one stroke onto a 2D context. Points are stored in the canvas-CSS
// coordinate space at draw time (canvasW × canvasH); the scale factors map
// them onto the current canvas size, and the line width is scaled by the
// average factor so the same stroke looks consistent across zooms.
//
// Used by the stroke-event render path (room mode) — both for the initial
// full-replay and for the incremental "new strokes only" apply.
function applyStrokeToCtx(
  ctx: CanvasRenderingContext2D,
  stroke: RoomStrokePayload,
  scaleX: number,
  scaleY: number,
) {
  const { tool, penType, color, size, points } = stroke;
  if (!points || points.length === 0) return;
  const sizeScale = (scaleX + scaleY) / 2;
  ctx.save();
  applyCtx(ctx, tool, penType, color, size * sizeScale);
  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x * scaleX, p.y * scaleY, Math.max(ctx.lineWidth / 2, 1), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0].x * scaleX, points[0].y * scaleY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * scaleX, points[i].y * scaleY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ── Voice note badge ──────────────────────────────────────────────────────────

function VoiceNoteBadge({
  notes, isRecordingHere, onRecordStart, onRecordStop,
}: {
  notes: VoiceNote[];
  isRecordingHere: boolean;
  onRecordStart: () => void;
  onRecordStop: () => void;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleMicClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!notes.length) return;
    const note = notes[notes.length - 1];
    if (playingId === note.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(note.audioUrl);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.play();
    setPlayingId(note.id);
  };

  const pillBase: React.CSSProperties = {
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  };

  return (
    <div style={{
      position: 'absolute', bottom: 10, right: 10,
      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end',
      zIndex: 5, pointerEvents: 'auto',
    }}>
      {notes.length > 0 && (
        <button
          onClick={handleMicClick}
          title={`${notes.length} voice note${notes.length > 1 ? 's' : ''} — click to play`}
          style={{
            ...pillBase,
            gap: 4, height: 26, padding: '0 8px',
            borderRadius: 13,
            background: playingId ? 'rgba(139,92,246,0.88)' : 'rgba(15,15,20,0.72)',
            color: '#fff', fontSize: 11, fontWeight: 600,
          }}
        >
          <Mic size={10} />
          <span>{notes.length}</span>
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); isRecordingHere ? onRecordStop() : onRecordStart(); }}
        title={isRecordingHere ? 'Stop recording' : 'Record voice note'}
        style={{
          ...pillBase,
          width: 26, height: 26, borderRadius: '50%',
          background: isRecordingHere ? 'rgba(220,38,38,0.88)' : 'rgba(15,15,20,0.72)',
          color: '#fff',
        }}
      >
        {isRecordingHere
          ? <Square size={9} fill="white" strokeWidth={0} />
          : <Plus size={12} />
        }
      </button>
    </div>
  );
}

// ── Single page item ──────────────────────────────────────────────────────────

interface PageItemProps {
  vp: VirtualPage;
  document: PDFDocument;
  containerWidth: number;
  zoom: number;
  notes: VoiceNote[];
  isRecordingHere: boolean;
  onRecordStart: () => void;
  onRecordStop: () => void;
  pageRefsMap: Map<number, HTMLDivElement>;
  index: number;
  tool: Tool;
  penType: PenType;
  color: string;
  strokeSize: number;
  annotationActive: boolean;
  savedDrawing?: string;
  onSavePageDrawing: (docId: string, page: number, data: string) => void;
  // Blank-page drawing — opt-in so existing callers keep their current
  // (no-canvas) blank-page rendering.
  savedBlankDrawing?: string;
  onSaveBlankDrawing?: (pageId: string, data: string) => void;
  // Blank-page text notes — opt-in. Mounted only when both notes + saver
  // are provided so the room (which has no per-page text-note store) is
  // unaffected.
  blankNotes?: TextNote[];
  onSaveBlankNotes?: (pageId: string, notes: TextNote[]) => void;
  onActivateTextTool?: () => void;
  onExitTextTool?: () => void;
  // PDF-page text notes — parallel opt-in to the blank-page pair above so
  // the same TextNotesLayer + click-create overlay can mount on PDF pages
  // in scroll mode. Keyed by pdfPage (number) instead of blankPage.id.
  pdfNotes?: TextNote[];
  onSavePdfNotes?: (pdfPage: number, notes: TextNote[]) => void;
  // ── Stroke-event mode (room collaborative drawings) ────────────────────
  // When `onStrokeComplete` is set, the canvas switches from "snapshot a
  // PNG of the full canvas on every stopDraw" to "emit one stroke event
  // per completed stroke; replay strokes by id on every render." This
  // eliminates the last-write-wins overwrite bug from concurrent drawing.
  // Workspace single-user callers leave both undefined and keep the PNG
  // path. See supabase/migrations/2026-06-29_room_strokes.sql.
  strokes?: RoomStrokePayload[];
  onStrokeComplete?: (pageKey: string, stroke: RoomStrokePayload) => void;
}

const ScrollPageItem = memo(function ScrollPageItem({
  vp, document, containerWidth, zoom, notes,
  isRecordingHere, onRecordStart, onRecordStop,
  pageRefsMap, index,
  tool, penType, color, strokeSize, annotationActive,
  savedDrawing, onSavePageDrawing,
  savedBlankDrawing, onSaveBlankDrawing,
  blankNotes, onSaveBlankNotes, onActivateTextTool, onExitTextTool,
  pdfNotes, onSavePdfNotes,
  strokes, onStrokeComplete,
}: PageItemProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // nearViewport: true when within 2000px of viewport — drives virtualization
  const [nearViewport, setNearViewport] = useState(false);
  const [cssDims, setCssDims] = useState<{ w: number; h: number } | null>(null);
  // Ref mirrors cssDims so the IO callback can read it without stale closure
  const cssDimsRef = useRef<{ w: number; h: number } | null>(null);
  const renderKeyRef = useRef(0);
  // Tracks the in-flight PDF.js render so the next effect run can cancel it
  // before starting a new render on the same canvas. Without this, two
  // page.render() calls race on a single 2D context — `canvas.width = …`
  // between starts resets the transform, and PDF.js's transform applications
  // collide, producing intermittent 180°-flipped pages. (Matches the
  // renderTaskRef pattern used in src/components/PDFViewer.tsx.)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Drawing state
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const canvasDimsRef = useRef<{ w: number; h: number } | null>(null);
  // Snapshot of the draw canvas captured when a line-tool stroke starts.
  // Each pointermove restores it then redraws the straight line from
  // start → current, giving a rubber-band preview without leaving prior
  // intermediate lines behind. Cleared on stopDraw.
  const lineSnapshotRef = useRef<ImageData | null>(null);

  // ── Stroke-event mode state ─────────────────────────────────────────────
  // `appliedStrokeIdsRef` tracks which strokes from the `strokes` prop are
  // already painted on the canvas — the incremental-apply effect uses it
  // to skip strokes that were already drawn (either by replay or by the
  // local user just now). Cleared on canvas resize so a full replay can
  // re-fill it from scratch.
  const appliedStrokeIdsRef = useRef<Set<string>>(new Set());
  // `currentStrokePointsRef` collects points during a local stroke; on
  // stopDraw they become the stroke event's points list. Cleared per stroke.
  const currentStrokePointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const currentStrokeIdRef = useRef<string>('');
  // Line tool stores its end position separately because lastPos.current
  // stays anchored at the line's start during continueDraw (rubber-band).
  const lineEndPosRef = useRef<{ x: number; y: number } | null>(null);

  // Stroke-event mode is opt-in: when both a strokes prop and the completion
  // callback are passed, this page item uses the stroke-event render path
  // instead of the PNG-snapshot path. Workspace callers leave both undefined.
  const strokeMode = !!onStrokeComplete;
  const pageKey: string =
    vp.type === 'pdf'
      ? `pdf:${vp.pdfPage}`
      : `blank:${vp.blankPage.id}`;

  // Keep cssDimsRef in sync
  useEffect(() => { cssDimsRef.current = cssDims; }, [cssDims]);

  // Register in parent scroll-tracking map
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    pageRefsMap.set(index, el);
    return () => { pageRefsMap.delete(index); };
  }, [index, pageRefsMap]);

  // Initial lazy-load observer — triggers first render when within 600px
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Virtualization observer — pages > 2000px away become lightweight placeholders
  // Only virtualizes once height is known (prevents layout shifts from unknown heights)
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
        } else if (cssDimsRef.current || vp.type === 'blank') {
          setNearViewport(false);
        }
      },
      { rootMargin: '2000px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  // vp.type is stable per page; re-running on type change is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp.type]);

  // PDF render — nearViewport added so pages re-render when returning to window
  useEffect(() => {
    if (!visible || !nearViewport || vp.type !== 'pdf') return;
    const canvas = canvasRef.current;
    if (!canvas || containerWidth < 10) return;
    const key = ++renderKeyRef.current;
    // Cancel any in-flight render on this canvas before starting a new one.
    // Without this, the next page.render() races with the previous one on the
    // same 2D context and produces intermittent 180°-flipped output.
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;

    (async () => {
      try {
        const doc = await getDocProxy(document.url);
        if (key !== renderKeyRef.current) return;
        const page = await doc.getPage(vp.pdfPage);
        if (key !== renderKeyRef.current) return;

        const dpr = window.devicePixelRatio || 1;
        const baseVp = page.getViewport({ scale: 1 });
        const cssScale = (containerWidth / baseVp.width) * zoom;
        const cssVp = page.getViewport({ scale: cssScale });
        const viewport = page.getViewport({ scale: cssScale * dpr });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${cssVp.width}px`;
        canvas.style.height = `${cssVp.height}px`;

        const renderTask = page.render({ canvas, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
        if (key !== renderKeyRef.current) return;
        setCssDims({ w: cssVp.width, h: cssVp.height });

        const tlContainer = textLayerRef.current;
        if (tlContainer) {
          tlContainer.innerHTML = '';
          tlContainer.style.setProperty('--total-scale-factor', String(cssScale));
          try {
            const pdfjsLib = await getPDFJS();
            const layer = new pdfjsLib.TextLayer({
              textContentSource: page.streamTextContent(),
              container: tlContainer,
              viewport: cssVp,
            });
            await layer.render();
          } catch { /* text layer is non-critical */ }
        }
      } catch { /* cancelled or PDF error */ }
    })();

    return () => {
      // Cleanup: cancel render on unmount or before re-run so the next
      // effect cycle doesn't collide with a still-running render.
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [visible, nearViewport, vp, document.url, containerWidth, zoom]);

  // Drawing canvas setup — nearViewport added so drawings reload when returning to window.
  // Two render paths share this effect:
  //   • PNG mode (workspace): load `savedDrawing` data URL onto the canvas.
  //   • Stroke-event mode (room): replay every stroke from the `strokes` prop
  //     in seq order. `appliedStrokeIdsRef` is reset and re-filled so the
  //     incremental-apply effect downstream knows nothing else needs painting.
  useEffect(() => {
    if (vp.type !== 'pdf' || !cssDims || !nearViewport) return;
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = cssDims;
    canvasDimsRef.current = { w, h };
    drawCanvas.width = Math.round(w * dpr);
    drawCanvas.height = Math.round(h * dpr);
    drawCanvas.style.width = `${w}px`;
    drawCanvas.style.height = `${h}px`;
    const ctx = drawCanvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (strokeMode) {
      appliedStrokeIdsRef.current = new Set();
      if (strokes && strokes.length > 0) {
        for (const s of strokes) {
          const scaleX = w / (s.canvasW || w);
          const scaleY = h / (s.canvasH || h);
          applyStrokeToCtx(ctx, s, scaleX, scaleY);
          appliedStrokeIdsRef.current.add(s.id);
        }
      }
    } else if (savedDrawing) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = savedDrawing;
    }
    isDrawing.current = false;
    lastPos.current = null;
  // strokes deliberately excluded — the incremental-apply effect below
  // handles strokes-array changes without resizing/clearing the canvas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cssDims?.w, cssDims?.h, vp.type, nearViewport, savedDrawing, strokeMode]);

  // Blank-page drawing canvas setup — mirrors the PDF effect above but uses
  // synthetic dimensions (no PDF render produces cssDims for blank pages).
  // Re-runs when savedBlankDrawing (PNG mode) or strokes (event mode) reset.
  useEffect(() => {
    if (vp.type !== 'blank' || !nearViewport || containerWidth < 10) return;
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth * zoom;
    const h = w * 1.414;
    canvasDimsRef.current = { w, h };
    drawCanvas.width = Math.round(w * dpr);
    drawCanvas.height = Math.round(h * dpr);
    drawCanvas.style.width = `${w}px`;
    drawCanvas.style.height = `${h}px`;
    const ctx = drawCanvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (strokeMode) {
      appliedStrokeIdsRef.current = new Set();
      if (strokes && strokes.length > 0) {
        for (const s of strokes) {
          const scaleX = w / (s.canvasW || w);
          const scaleY = h / (s.canvasH || h);
          applyStrokeToCtx(ctx, s, scaleX, scaleY);
          appliedStrokeIdsRef.current.add(s.id);
        }
      }
    } else if (savedBlankDrawing) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = savedBlankDrawing;
    }
    isDrawing.current = false;
    lastPos.current = null;
  // strokes excluded — handled by the incremental-apply effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp.type, nearViewport, containerWidth, zoom, savedBlankDrawing, strokeMode]);

  // ── Incremental stroke apply (room mode) ────────────────────────────────
  // Runs whenever the strokes prop changes. Paints any stroke whose id is
  // NOT already in appliedStrokeIdsRef — i.e. ones that arrived since the
  // last render. Local strokes that the user just finished are pre-added
  // to the applied set in stopDraw, so this loop is a no-op for them
  // (avoids the flash from a full clear-and-replay).
  useEffect(() => {
    if (!strokeMode || !strokes || strokes.length === 0) return;
    const drawCanvas = drawCanvasRef.current;
    const dims = canvasDimsRef.current;
    if (!drawCanvas || !dims) return;
    const ctx = drawCanvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = dims;
    for (const s of strokes) {
      if (appliedStrokeIdsRef.current.has(s.id)) continue;
      const scaleX = w / (s.canvasW || w);
      const scaleY = h / (s.canvasH || h);
      applyStrokeToCtx(ctx, s, scaleX, scaleY);
      appliedStrokeIdsRef.current.add(s.id);
    }
  }, [strokes, strokeMode]);

  const getPos = (e: { clientX: number; clientY: number }) => {
    const dims = canvasDimsRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!dims || !drawCanvas) return { x: 0, y: 0 };
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (dims.w / rect.width),
      y: (e.clientY - rect.top) * (dims.h / rect.height),
    };
  };

  const saveCanvas = useCallback(() => {
    const drawCanvas = drawCanvasRef.current;
    if (!drawCanvas) return;
    if (vp.type === 'pdf') {
      onSavePageDrawing(document.id, vp.pdfPage, drawCanvas.toDataURL('image/png'));
    } else if (vp.type === 'blank' && onSaveBlankDrawing) {
      onSaveBlankDrawing(vp.blankPage.id, drawCanvas.toDataURL('image/png'));
    }
  }, [document.id, onSavePageDrawing, onSaveBlankDrawing, vp]);

  const startDraw = (pos: { x: number; y: number }) => {
    if (tool === 'text') return;
    const drawCanvas = drawCanvasRef.current;
    const ctx = drawCanvas?.getContext('2d');
    if (!drawCanvas || !ctx || !canvasDimsRef.current) return;
    isDrawing.current = true;
    lastPos.current = pos;
    if (strokeMode) {
      // Begin a new stroke event. `id` is a stable client uuid so dedup-by-id
      // works whether the stroke arrives at other clients via realtime or via
      // the reconnect-reconciliation DB fetch.
      currentStrokeIdRef.current = crypto.randomUUID();
      currentStrokePointsRef.current = [{ x: pos.x, y: pos.y }];
      lineEndPosRef.current = null;
    }
    if (tool === 'line') {
      // Snapshot the pre-line canvas; continueDraw will restore it before
      // each rubber-band redraw. Skip the starting dot so an unmoved click
      // leaves the canvas untouched.
      lineSnapshotRef.current = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
      return;
    }
    ctx.save();
    applyCtx(ctx, tool, penType, color, strokeSize);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(ctx.lineWidth / 2, 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const continueDraw = (pos: { x: number; y: number }) => {
    if (!isDrawing.current || !lastPos.current) return;
    const drawCanvas = drawCanvasRef.current;
    const ctx = drawCanvas?.getContext('2d');
    if (!drawCanvas || !ctx) return;
    if (tool === 'line') {
      // Restore the pre-line snapshot then draw the straight line. Don't
      // advance lastPos — it stays as the line's anchor for the next move.
      if (lineSnapshotRef.current) ctx.putImageData(lineSnapshotRef.current, 0, 0);
      ctx.save();
      applyCtx(ctx, tool, penType, color, strokeSize);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
      if (strokeMode) lineEndPosRef.current = { x: pos.x, y: pos.y };
      return;
    }
    ctx.save();
    applyCtx(ctx, tool, penType, color, strokeSize);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.restore();
    lastPos.current = pos;
    if (strokeMode) currentStrokePointsRef.current.push({ x: pos.x, y: pos.y });
  };

  const stopDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    lineSnapshotRef.current = null;
    if (strokeMode) {
      // Build and emit the stroke event. We pre-add the id to the applied
      // set so the incremental-apply effect skips re-painting (the canvas
      // already has these pixels from the live draw).
      // Tool narrows here because startDraw early-returns for 'text', so
      // isDrawing.current can only be true for paintable tools.
      const dims = canvasDimsRef.current;
      const isPaintTool = tool === 'pen' || tool === 'eraser' || tool === 'line';
      // Verbose trace — confirms stopDraw fires in stroke mode + that the
      // callback prop is actually wired. If `onStrokeCallbackPresent` ever
      // logs false on a user reporting the bug, the parent isn't passing it.
      console.log('[Draw] stopDraw stroke-mode', {
        pageKey, tool, penType,
        hasDims: !!dims,
        isPaintTool,
        capturedPoints: currentStrokePointsRef.current.length,
        lineEnd: !!lineEndPosRef.current,
        onStrokeCallbackPresent: !!onStrokeComplete,
        strokeIdInFlight: currentStrokeIdRef.current,
      });
      if (dims && isPaintTool) {
        const points = tool === 'line'
          ? (() => {
              const start = currentStrokePointsRef.current[0];
              const end   = lineEndPosRef.current ?? start;
              return start ? [start, end] : [];
            })()
          : currentStrokePointsRef.current.slice();
        if (points.length > 0) {
          const stroke: RoomStrokePayload = {
            id:       currentStrokeIdRef.current,
            tool,
            penType,
            color,
            size:     strokeSize,
            points,
            compositeMode: tool === 'eraser' ? 'destination-out' : 'source-over',
            canvasW:  dims.w,
            canvasH:  dims.h,
          };
          appliedStrokeIdsRef.current.add(stroke.id);
          console.log('[Draw] stopDraw EMIT', { pageKey, strokeId: stroke.id, points: points.length });
          // Sentinel — surfaces the function ref's type at the actual call
          // site. If this logs 'function' but STROKE_DIAG_A doesn't appear,
          // the call site is invoking a different function than the
          // RoomClient-defined handleStrokeComplete (stale memo / closure /
          // bundle mismatch).
          console.log('STROKE_DIAG_CALL_SITE pageKey/strokeId/cbType', pageKey, stroke.id, typeof onStrokeComplete);
          onStrokeComplete?.(pageKey, stroke);
          console.log('STROKE_DIAG_CALL_SITE_RETURNED', stroke.id);
        } else {
          console.warn('[Draw] stopDraw NO-EMIT — points.length=0', { pageKey, tool });
        }
      } else {
        console.warn('[Draw] stopDraw NO-EMIT — guard failed', { pageKey, tool, hasDims: !!dims, isPaintTool });
      }
      currentStrokePointsRef.current = [];
      currentStrokeIdRef.current = '';
      lineEndPosRef.current = null;
      return;
    }
    saveCanvas();
  };

  const canDrawNow =
    annotationActive
    && tool !== 'text'
    && (vp.type === 'pdf' || (vp.type === 'blank' && !!onSaveBlankDrawing));
  const pageW = containerWidth * zoom;
  const pageH = cssDims?.h ?? pageW * 1.414;
  const shadow = '0 2px 16px rgba(0,0,0,0.45)';

  // Lightweight placeholder for pages far outside the viewport
  // Only used after height is established to prevent layout shifts
  const isVirtualized = !nearViewport && (vp.type === 'blank' || cssDims !== null);
  if (isVirtualized) {
    const vh = vp.type === 'blank' ? pageW * 1.414 : cssDims!.h;
    const bg = vp.type === 'blank'
      ? (vp.blankPage.bgTheme === 'dark' ? '#1e1e2e' : '#ffffff')
      : '#fff';
    return (
      <div ref={outerRef} style={{
        position: 'relative', width: pageW, height: vh,
        borderRadius: 4, boxShadow: shadow, flexShrink: 0,
        background: bg,
      }} />
    );
  }

  if (vp.type === 'blank') {
    const isDark = vp.blankPage.bgTheme === 'dark';
    const blankH = pageW * 1.414;
    return (
      <div ref={outerRef} style={{
        position: 'relative',
        width: pageW, height: blankH,
        borderRadius: 4, boxShadow: shadow, flexShrink: 0, overflow: 'hidden',
        backgroundColor: isDark ? '#1e1e2e' : '#ffffff',
        backgroundImage: `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'} 1px, transparent 1px)`,
        backgroundSize: '12px 12px',
      }}>
        <span style={{
          position: 'absolute', top: 12, left: 14,
          fontSize: 11, fontWeight: 500,
          color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
        }}>
          Blank
        </span>
        {/* Drawing canvas overlay — mirrors the PDF branch. Only mounts when
            the parent opts in via onSaveBlankDrawing; without it the page
            stays read-only as before. */}
        {onSaveBlankDrawing && (
          <canvas
            ref={drawCanvasRef}
            style={{
              position: 'absolute', top: 0, left: 0,
              display: 'block',
              zIndex: 3,
              pointerEvents: canDrawNow ? 'auto' : 'none',
              cursor: canDrawNow ? getDrawingCursor(tool, penType) : 'default',
              touchAction: canDrawNow ? 'none' : 'pan-y',
            }}
            onMouseDown={(e) => { if (!canDrawNow) return; startDraw(getPos(e.nativeEvent)); }}
            onMouseMove={(e) => { if (!canDrawNow) return; continueDraw(getPos(e.nativeEvent)); }}
            onMouseUp={() => canDrawNow && stopDraw()}
            onMouseLeave={() => canDrawNow && stopDraw()}
            onTouchStart={(e) => {
              if (!canDrawNow) return;
              e.preventDefault();
              if (e.touches.length === 1) startDraw(getPos(e.touches[0]));
            }}
            onTouchMove={(e) => {
              if (!canDrawNow) return;
              e.preventDefault();
              if (e.touches.length === 1) continueDraw(getPos(e.touches[0]));
            }}
            onTouchEnd={() => canDrawNow && stopDraw()}
          />
        )}
        {/* Text notes overlay — opt-in. TextNotesLayer renders/edits the
            notes themselves; we DON'T rely on its internal z:-1 click-
            create overlay for placement here, because it sits inside the
            wrapper's z:10 stacking context above a z:3 drawing canvas and
            hit-test of that arrangement is fragile across browsers. */}
        {onSaveBlankNotes && blankNotes !== undefined && (
          <TextNotesLayer
            notes={blankNotes}
            onChange={(next) => onSaveBlankNotes(vp.blankPage.id, next)}
            toolActive={false}
            onActivateTextTool={onActivateTextTool}
            onExitTextTool={onExitTextTool}
          />
        )}
        {/* Dedicated text-note placement overlay — only mounted when the
            text tool is active. zIndex:5 puts it ABOVE the drawing canvas
            (z:3) so empty-area clicks land here, but BELOW the
            TextNotesLayer wrapper (z:10) so existing notes (which have
            pointer-events:auto inside the wrapper) keep capturing clicks
            for selection/edit. */}
        {onSaveBlankNotes && tool === 'text' && (
          <div
            style={{
              position: 'absolute', inset: 0,
              zIndex: 5,
              pointerEvents: 'auto',
              cursor: 'text',
              touchAction: 'manipulation',
            }}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width)  * 100;
              const y = ((e.clientY - rect.top)  / rect.height) * 100;
              const newNote: TextNote = {
                id: crypto.randomUUID(),
                x: Math.max(0, Math.min(78, x)),
                y: Math.max(0, Math.min(95, y)),
                width: 20,
                height: 5,
                content: '',
                fontSize: 13,
                color: '#222222',
              };
              onSaveBlankNotes(vp.blankPage.id, [...(blankNotes ?? []), newNote]);
              onExitTextTool?.();
            }}
          />
        )}
        <VoiceNoteBadge
          notes={notes} isRecordingHere={isRecordingHere}
          onRecordStart={onRecordStart} onRecordStop={onRecordStop}
        />
      </div>
    );
  }

  return (
    <div ref={outerRef} style={{
      position: 'relative',
      width: pageW, height: pageH,
      borderRadius: 4, boxShadow: shadow, flexShrink: 0, overflow: 'hidden',
      background: '#fff',
    }}>
      {/* Spinner while page is loading */}
      {visible && !cssDims && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.9)',
        }}>
          <div className="spinner" style={{
            width: 18, height: 18,
            border: '2px solid #ddd', borderTopColor: '#666',
            borderRadius: '50%',
          }} />
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div ref={textLayerRef} className="pdf-text-layer" />
      {/* Drawing canvas overlay — mounted once PDF renders */}
      {cssDims && (
        <canvas
          ref={drawCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0,
            display: 'block',
            zIndex: 3,
            pointerEvents: canDrawNow ? 'auto' : 'none',
            cursor: canDrawNow ? getDrawingCursor(tool, penType) : 'default',
            touchAction: canDrawNow ? 'none' : 'pan-y',
          }}
          onMouseDown={(e) => { if (!canDrawNow) return; startDraw(getPos(e.nativeEvent)); }}
          onMouseMove={(e) => { if (!canDrawNow) return; continueDraw(getPos(e.nativeEvent)); }}
          onMouseUp={() => canDrawNow && stopDraw()}
          onMouseLeave={() => canDrawNow && stopDraw()}
          onTouchStart={(e) => {
            if (!canDrawNow) return;
            e.preventDefault();
            if (e.touches.length === 1) startDraw(getPos(e.touches[0]));
          }}
          onTouchMove={(e) => {
            if (!canDrawNow) return;
            e.preventDefault();
            if (e.touches.length === 1) continueDraw(getPos(e.touches[0]));
          }}
          onTouchEnd={() => canDrawNow && stopDraw()}
        />
      )}
      {/* Text notes overlay (PDF pages) — mirrors the blank-page branch.
          TextNotesLayer renders existing notes; toolActive is false so its
          internal click-create overlay never arms — placement is owned by
          the dedicated z:5 overlay below. */}
      {onSavePdfNotes && pdfNotes !== undefined && (
        <TextNotesLayer
          notes={pdfNotes}
          onChange={(next) => onSavePdfNotes(vp.pdfPage, next)}
          toolActive={false}
          onActivateTextTool={onActivateTextTool}
          onExitTextTool={onExitTextTool}
        />
      )}
      {/* Dedicated text-note placement overlay for PDF pages — same z:5
          layering as the blank branch: above the drawing canvas (z:3) so
          empty clicks land here, below the TextNotesLayer wrapper (z:10)
          so existing notes still capture clicks. */}
      {onSavePdfNotes && tool === 'text' && (
        <div
          style={{
            position: 'absolute', inset: 0,
            zIndex: 5,
            pointerEvents: 'auto',
            cursor: 'text',
            touchAction: 'manipulation',
          }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width)  * 100;
            const y = ((e.clientY - rect.top)  / rect.height) * 100;
            const newNote: TextNote = {
              id: crypto.randomUUID(),
              x: Math.max(0, Math.min(78, x)),
              y: Math.max(0, Math.min(95, y)),
              width: 20,
              height: 5,
              content: '',
              fontSize: 13,
              color: '#222222',
            };
            onSavePdfNotes(vp.pdfPage, [...(pdfNotes ?? []), newNote]);
            onExitTextTool?.();
          }}
        />
      )}
      <VoiceNoteBadge
        notes={notes} isRecordingHere={isRecordingHere}
        onRecordStart={onRecordStart} onRecordStop={onRecordStop}
      />
    </div>
  );
});

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  document: PDFDocument;
  virtualPages: VirtualPage[];
  currentVirtualIndex: number;
  onPageChange: (index: number) => void;
  zoom: number;
  getNotesForPage: (docId: string, pageId: number | string) => VoiceNote[];
  isRecording: boolean;
  recordingContext: { documentId: string; pageNumber: number | string } | null;
  onRecordStart: (docId: string, pageId: number | string) => void;
  onRecordStop: () => void;
  tool: Tool;
  penType: PenType;
  color: string;
  strokeSize: number;
  annotationActive: boolean;
  getDrawing: (docId: string, page: number) => string | undefined;
  saveDrawing: (docId: string, page: number, data: string) => void;
  getBlankDrawing?: (pageId: string) => string | undefined;
  saveBlankDrawing?: (pageId: string, data: string) => void;
  // ── Stroke-event mode (room collaborative drawings) ────────────────────
  // When `onStrokeComplete` is set, the page items switch from PNG-snapshot
  // saves to append-only stroke events. `roomStrokes` is the per-page-key
  // map of strokes (already sorted by seq) that each ScrollPageItem replays.
  // page_key shape: 'pdf:<n>' for PDF pages, 'blank:<uuid>' for blank pages.
  roomStrokes?: Record<string, RoomStrokePayload[]>;
  onStrokeComplete?: (pageKey: string, stroke: RoomStrokePayload) => void;
  getBlankNotes?: (pageId: string) => TextNote[];
  saveBlankNotes?: (pageId: string, notes: TextNote[]) => void;
  onActivateTextTool?: () => void;
  onExitTextTool?: () => void;
  getPdfNotes?: (pdfPage: number) => TextNote[];
  savePdfNotes?: (pdfPage: number, notes: TextNote[]) => void;
}

export default function PDFScrollViewer({
  document, virtualPages, currentVirtualIndex, onPageChange,
  zoom, getNotesForPage, isRecording, recordingContext,
  onRecordStart, onRecordStop,
  tool, penType, color, strokeSize, annotationActive,
  getDrawing, saveDrawing,
  getBlankDrawing, saveBlankDrawing,
  getBlankNotes, saveBlankNotes, onActivateTextTool, onExitTextTool,
  getPdfNotes, savePdfNotes,
  roomStrokes, onStrokeComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const [containerWidth, setContainerWidth] = useState(600);
  const programmaticRef = useRef(false);
  // Tracks last index reported via user scroll — prevents feedback loop where
  // onScroll → onPageChange → currentVirtualIndex → programmatic scroll back
  const lastScrollReportedIdxRef = useRef(currentVirtualIndex);
  const mountedRef = useRef(false);
  const initialIndexRef = useRef(currentVirtualIndex);

  // Measure content width consistently — getBoundingClientRect includes padding (24px×2=48px)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(Math.floor(el.getBoundingClientRect().width - 48));
    const obs = new ResizeObserver(([entry]) => {
      // contentRect already excludes padding
      setContainerWidth(Math.floor(entry.contentRect.width));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // On mount: jump to current page without animation
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const t = setTimeout(() => {
      const el = pageRefsMap.current.get(initialIndexRef.current);
      if (el && containerRef.current) {
        containerRef.current.scrollTop = Math.max(0, el.offsetTop - 24);
      }
    }, 120);
    return () => clearTimeout(t);
  }, []);

  // External index change (nav buttons / thumbnails) → smooth scroll
  // Skipped when currentVirtualIndex matches what the user already scrolled to,
  // preventing the feedback loop: user scroll → index update → scroll-back jitter
  useEffect(() => {
    if (!mountedRef.current) return;
    if (currentVirtualIndex === lastScrollReportedIdxRef.current) return;
    const el = pageRefsMap.current.get(currentVirtualIndex);
    if (!el || !containerRef.current) return;
    programmaticRef.current = true;
    containerRef.current.scrollTo({ top: Math.max(0, el.offsetTop - 24), behavior: 'smooth' });
    const t = setTimeout(() => {
      programmaticRef.current = false;
      // Sync ref so subsequent user scrolls from this position don't re-trigger
      lastScrollReportedIdxRef.current = currentVirtualIndex;
    }, 900);
    return () => clearTimeout(t);
  }, [currentVirtualIndex]);

  // User scroll → find nearest page → update index
  const onScroll = useCallback(() => {
    if (programmaticRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const viewMid = container.scrollTop + container.clientHeight / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    pageRefsMap.current.forEach((el, idx) => {
      const elMid = el.offsetTop + el.offsetHeight / 2;
      const dist = Math.abs(elMid - viewMid);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    // Only report if index actually changed — prevents redundant parent re-renders
    if (bestIdx !== lastScrollReportedIdxRef.current) {
      lastScrollReportedIdxRef.current = bestIdx;
      onPageChange(bestIdx);
    }
  }, [onPageChange]);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'auto',
        padding: '24px',
        touchAction: 'pan-y',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}
    >
      {virtualPages.map((vp, idx) => {
        const pageId: number | string =
          vp.type === 'pdf' ? vp.pdfPage : vp.blankPage.id;
        const notes = getNotesForPage(document.id, pageId);
        const isRecordingHere =
          isRecording &&
          recordingContext?.documentId === document.id &&
          recordingContext?.pageNumber === pageId;
        const savedDrawing = vp.type === 'pdf'
          ? getDrawing(document.id, vp.pdfPage)
          : undefined;
        const savedBlankDrawing = vp.type === 'blank' && getBlankDrawing
          ? getBlankDrawing(vp.blankPage.id)
          : undefined;
        // Stroke-event mode — pull the per-page slice if the parent opted in.
        const pageKey = vp.type === 'pdf'
          ? `pdf:${vp.pdfPage}`
          : `blank:${vp.blankPage.id}`;
        const pageStrokes = roomStrokes ? roomStrokes[pageKey] : undefined;
        const blankNotes = vp.type === 'blank' && getBlankNotes
          ? getBlankNotes(vp.blankPage.id)
          : undefined;
        const pdfNotesForPage = vp.type === 'pdf' && getPdfNotes
          ? getPdfNotes(vp.pdfPage)
          : undefined;

        return (
          <ScrollPageItem
            key={vp.type === 'pdf' ? `pdf-${vp.pdfPage}` : `blank-${vp.blankPage.id}`}
            vp={vp}
            document={document}
            containerWidth={containerWidth}
            zoom={zoom}
            notes={notes}
            isRecordingHere={isRecordingHere}
            onRecordStart={() => onRecordStart(document.id, pageId)}
            onRecordStop={onRecordStop}
            pageRefsMap={pageRefsMap.current}
            index={idx}
            tool={tool}
            penType={penType}
            color={color}
            strokeSize={strokeSize}
            annotationActive={annotationActive}
            savedDrawing={savedDrawing}
            onSavePageDrawing={saveDrawing}
            savedBlankDrawing={savedBlankDrawing}
            onSaveBlankDrawing={saveBlankDrawing}
            blankNotes={blankNotes}
            onSaveBlankNotes={saveBlankNotes}
            onActivateTextTool={onActivateTextTool}
            onExitTextTool={onExitTextTool}
            pdfNotes={pdfNotesForPage}
            onSavePdfNotes={savePdfNotes}
            strokes={pageStrokes}
            onStrokeComplete={onStrokeComplete}
          />
        );
      })}
      <div style={{ height: 48, flexShrink: 0 }} />
    </div>
  );
}
