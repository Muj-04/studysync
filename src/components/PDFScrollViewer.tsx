'use client';
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFDocument, VoiceNote, BlankPage } from '@/types';
import type { Tool, PenType } from '@/lib/drawing';
import { getDrawingCursor } from '@/lib/drawing';
import { Mic, Plus, Square } from 'lucide-react';

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
}

const ScrollPageItem = memo(function ScrollPageItem({
  vp, document, containerWidth, zoom, notes,
  isRecordingHere, onRecordStart, onRecordStop,
  pageRefsMap, index,
  tool, penType, color, strokeSize, annotationActive,
  savedDrawing, onSavePageDrawing,
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

  // Drawing state
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const canvasDimsRef = useRef<{ w: number; h: number } | null>(null);

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
        await renderTask.promise;
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
  }, [visible, nearViewport, vp, document.url, containerWidth, zoom]);

  // Drawing canvas setup — nearViewport added so drawings reload when returning to window
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
    if (savedDrawing) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = savedDrawing;
    }
    isDrawing.current = false;
    lastPos.current = null;
  }, [cssDims?.w, cssDims?.h, vp.type, nearViewport, savedDrawing]);

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
    if (drawCanvas && vp.type === 'pdf') {
      onSavePageDrawing(document.id, vp.pdfPage, drawCanvas.toDataURL('image/png'));
    }
  }, [document.id, onSavePageDrawing, vp]);

  const startDraw = (pos: { x: number; y: number }) => {
    if (tool === 'text') return;
    const drawCanvas = drawCanvasRef.current;
    const ctx = drawCanvas?.getContext('2d');
    if (!drawCanvas || !ctx || !canvasDimsRef.current) return;
    isDrawing.current = true;
    lastPos.current = pos;
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
    ctx.save();
    applyCtx(ctx, tool, penType, color, strokeSize);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.restore();
    lastPos.current = pos;
  };

  const stopDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    saveCanvas();
  };

  const canDrawNow = annotationActive && vp.type === 'pdf' && tool !== 'text';
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
    return (
      <div ref={outerRef} style={{
        position: 'relative',
        width: pageW, height: pageW * 1.414,
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
}

export default function PDFScrollViewer({
  document, virtualPages, currentVirtualIndex, onPageChange,
  zoom, getNotesForPage, isRecording, recordingContext,
  onRecordStart, onRecordStop,
  tool, penType, color, strokeSize, annotationActive,
  getDrawing, saveDrawing,
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
          />
        );
      })}
      <div style={{ height: 48, flexShrink: 0 }} />
    </div>
  );
}
