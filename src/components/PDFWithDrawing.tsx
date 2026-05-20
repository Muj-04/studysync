'use client';
import { forwardRef, useRef, useEffect, useState, useCallback, useImperativeHandle } from 'react';
import PDFViewer from './PDFViewer';
import PDFSearchBar from './PDFSearchBar';
import TextNotesLayer from './TextNotesLayer';
import type { HighlightRect } from './PDFViewer';
import type { PDFDocument, TextNote } from '@/types';
import { getDrawingCursor } from '@/lib/drawing';
import type { Tool, PenType } from '@/lib/drawing';
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir: string;
  fontName: string;
  hasEOL: boolean;
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

type LineState =
  | { phase: 'idle' }
  | { phase: 'active'; start: { x: number; y: number }; snapshot: ImageData };

export interface DrawingCanvasHandle {
  clear: () => void;
  undo?: () => void;
}

// ── Search helpers ────────────────────────────────────────────────────────────

function computeHighlights(
  items: TextItem[],
  query: string,
  viewport: PageViewport,
): HighlightRect[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results: HighlightRect[] = [];

  for (const item of items) {
    if (!item.str) continue;
    const lower = item.str.toLowerCase();
    const [, , c, d, e, f] = item.transform;

    // Font height in user space (y-scale component of text matrix)
    const fontH = Math.abs(d) || Math.abs(c) || 10;

    let start = 0;
    while (true) {
      const found = lower.indexOf(q, start);
      if (found === -1) break;

      // Fractional x offsets within this text item (assumes uniform char width)
      const startFrac = found / item.str.length;
      const endFrac   = Math.min((found + q.length) / item.str.length, 1);
      const x0 = e + startFrac * item.width;
      const x1 = e + endFrac   * item.width;

      // Convert PDF user-space coords → CSS viewport pixels
      const [vx0, vy_base]  = viewport.convertToViewportPoint(x0, f);
      const [vx1]           = viewport.convertToViewportPoint(x1, f);
      const [, vy_top]      = viewport.convertToViewportPoint(x0, f + fontH);

      results.push({
        x: Math.min(vx0, vx1),
        y: Math.min(vy_base, vy_top),
        w: Math.abs(vx1 - vx0),
        h: Math.abs(vy_base - vy_top),
      });

      start = found + q.length;
    }
  }

  return results;
}

async function searchPage(
  page: PDFPageProxy,
  cssViewport: PageViewport,
  query: string,
): Promise<HighlightRect[]> {
  const textContent = await page.getTextContent();
  const items = textContent.items.filter(
    (item): item is TextItem => 'str' in item,
  );
  return computeHighlights(items, query, cssViewport);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  document: PDFDocument;
  tool: Tool;
  penType: PenType;
  color: string;
  strokeSize: number;
  savedData?: string;
  onSave: (data: string) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  interactive?: boolean;
  notes?: TextNote[];
  onNotesChange?: (notes: TextNote[]) => void;
  onActivateTextTool?: () => void;
  onExitTextTool?: () => void;
  /** When true, shows the search bar above the PDF. */
  searchOpen?: boolean;
  /** Called when the user closes the search bar. */
  onSearchClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PDFWithDrawing = forwardRef<DrawingCanvasHandle, Props>(
  function PDFWithDrawing({
    document, tool, penType, color, strokeSize, savedData, onSave,
    zoom = 1, onZoomChange, interactive = true,
    notes, onNotesChange, onActivateTextTool, onExitTextTool,
    searchOpen = false, onSearchClose,
  }, ref) {
    const drawCanvasRef  = useRef<HTMLCanvasElement>(null);
    const isDrawing      = useRef(false);
    const lastPos        = useRef<{ x: number; y: number } | null>(null);
    const [canvasDims, setCanvasDims] = useState<{ w: number; h: number } | null>(null);
    const canvasDimsRef  = useRef(canvasDims);
    canvasDimsRef.current = canvasDims;

    const lineStateRef = useRef<LineState>({ phase: 'idle' });
    const undoStack    = useRef<string[]>([]);

    // ── Search state ──────────────────────────────────────────────────────────
    const [searchQuery,    setSearchQuery]    = useState('');
    const [searchRects,    setSearchRects]    = useState<HighlightRect[]>([]);
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);

    // Refs so async callbacks always have fresh values
    const pdfPageRef    = useRef<PDFPageProxy | null>(null);
    const cssViewportRef = useRef<PageViewport | null>(null);
    const searchQueryRef = useRef('');
    searchQueryRef.current = searchQuery;

    // Reset search state when the bar is closed
    useEffect(() => {
      if (!searchOpen) {
        setSearchQuery('');
        setSearchRects([]);
        setActiveMatchIdx(0);
      }
    }, [searchOpen]);

    // Re-run search when query changes (debounced slightly)
    useEffect(() => {
      const q = searchQuery.trim();
      if (!q) { setSearchRects([]); setActiveMatchIdx(0); return; }
      const page = pdfPageRef.current;
      const vp   = cssViewportRef.current;
      if (!page || !vp) return;

      let cancelled = false;
      const timer = setTimeout(async () => {
        const rects = await searchPage(page, vp, q);
        if (!cancelled) { setSearchRects(rects); setActiveMatchIdx(0); }
      }, 120);

      return () => { cancelled = true; clearTimeout(timer); };
    }, [searchQuery, document.currentPage]);

    // Re-run search when the page is ready (handles page navigation)
    const handlePageReady = useCallback((page: PDFPageProxy, cssVp: PageViewport) => {
      pdfPageRef.current   = page;
      cssViewportRef.current = cssVp;
      const q = searchQueryRef.current.trim();
      if (!q) { setSearchRects([]); return; }
      searchPage(page, cssVp, q).then((rects) => {
        setSearchRects(rects);
        setActiveMatchIdx(0);
      });
    }, []);

    const goNext = useCallback(() => {
      setActiveMatchIdx((i) => (searchRects.length === 0 ? 0 : (i + 1) % searchRects.length));
    }, [searchRects.length]);

    const goPrev = useCallback(() => {
      setActiveMatchIdx((i) => (searchRects.length === 0 ? 0 : (i - 1 + searchRects.length) % searchRects.length));
    }, [searchRects.length]);

    // ── Drawing setup ─────────────────────────────────────────────────────────

    const cancelLine = useCallback(() => {
      const ls = lineStateRef.current;
      if (ls.phase !== 'active') return;
      const canvas = drawCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.putImageData(ls.snapshot, 0, 0);
      lineStateRef.current = { phase: 'idle' };
    }, []);

    useEffect(() => {
      if (tool !== 'line') cancelLine();
    }, [tool, cancelLine]);

    const handleCanvasDimensions = useCallback((w: number, h: number) => {
      setCanvasDims((prev) => (prev?.w === w && prev?.h === h ? prev : { w, h }));
    }, []);

    useEffect(() => {
      const canvas = drawCanvasRef.current;
      if (!canvas || !canvasDims) return;
      cancelLine();
      isDrawing.current = false;
      lastPos.current = null;
      undoStack.current = [];
      const { w, h } = canvasDims;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (savedData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, w, h);
        img.src = savedData;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [document.currentPage, canvasDims?.w, canvasDims?.h]);

    const getPos = (e: { clientX: number; clientY: number }) => {
      const canvas = drawCanvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const w = canvasDimsRef.current?.w ?? rect.width;
      const h = canvasDimsRef.current?.h ?? rect.height;
      return {
        x: (e.clientX - rect.left) * (w / rect.width),
        y: (e.clientY - rect.top) * (h / rect.height),
      };
    };

    const saveCanvas = useCallback(() => {
      const canvas = drawCanvasRef.current;
      if (canvas) onSave(canvas.toDataURL('image/png'));
    }, [onSave]);

    const startDraw = (pos: { x: number; y: number }) => {
      const canvas = drawCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !canvasDimsRef.current) return;
      if (tool === 'text') return;
      if (tool === 'line') {
        const ls = lineStateRef.current;
        if (ls.phase === 'idle') {
          undoStack.current = [...undoStack.current, canvas.toDataURL('image/png')].slice(-10);
          const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
          lineStateRef.current = { phase: 'active', start: pos, snapshot };
          ctx.save();
          applyCtx(ctx, 'pen', penType, color, strokeSize);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, Math.max(ctx.lineWidth / 2, 2), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.putImageData(ls.snapshot, 0, 0);
          if (pos.x !== ls.start.x || pos.y !== ls.start.y) {
            ctx.save();
            applyCtx(ctx, 'pen', penType, color, strokeSize);
            ctx.beginPath();
            ctx.moveTo(ls.start.x, ls.start.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            ctx.restore();
          }
          lineStateRef.current = { phase: 'idle' };
          saveCanvas();
        }
        return;
      }
      undoStack.current = [...undoStack.current, canvas.toDataURL('image/png')].slice(-10);
      isDrawing.current = true;
      lastPos.current = pos;
      ctx.save();
      applyCtx(ctx, tool, penType, color, strokeSize);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const continueDraw = (pos: { x: number; y: number }) => {
      if (tool === 'line') {
        const ls = lineStateRef.current;
        if (ls.phase !== 'active') return;
        const canvas = drawCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.putImageData(ls.snapshot, 0, 0);
        ctx.save();
        applyCtx(ctx, 'pen', penType, color, strokeSize);
        ctx.beginPath();
        ctx.moveTo(ls.start.x, ls.start.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (!isDrawing.current || !lastPos.current) return;
      const canvas = drawCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !canvasDimsRef.current) return;
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
      if (tool === 'line') return;
      if (!isDrawing.current) return;
      isDrawing.current = false;
      lastPos.current = null;
      saveCanvas();
    };

    const clearCanvas = useCallback(() => {
      cancelLine();
      const canvas = drawCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      const dims = canvasDimsRef.current;
      if (!canvas || !ctx || !dims) return;
      undoStack.current = [...undoStack.current, canvas.toDataURL('image/png')].slice(-10);
      ctx.clearRect(0, 0, dims.w, dims.h);
      onSave(canvas.toDataURL('image/png'));
    }, [onSave, cancelLine]);

    const undoCanvas = useCallback(() => {
      const stack = undoStack.current;
      if (stack.length === 0) return;
      const prev = stack[stack.length - 1];
      undoStack.current = stack.slice(0, -1);
      cancelLine();
      isDrawing.current = false;
      const canvas = drawCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      const dims = canvasDimsRef.current;
      if (!canvas || !ctx || !dims) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, dims.w, dims.h);
        ctx.drawImage(img, 0, 0, dims.w, dims.h);
        onSave(prev);
      };
      img.src = prev;
    }, [cancelLine, onSave]);

    useImperativeHandle(ref, () => ({ clear: clearCanvas, undo: undoCanvas }), [clearCanvas, undoCanvas]);

    const canDrawNow = interactive && tool !== 'text';

    const overlay = canvasDims ? (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 5,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        padding: 24, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'relative',
          width: canvasDims.w,
          height: canvasDims.h,
          flexShrink: 0,
          pointerEvents: 'none',
        }}>
          <canvas
            ref={drawCanvasRef}
            style={{
              display: 'block',
              pointerEvents: canDrawNow ? 'auto' : 'none',
              cursor: canDrawNow ? getDrawingCursor(tool, penType) : 'default',
              touchAction: 'none',
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
          {notes !== undefined && onNotesChange && (
            <TextNotesLayer
              notes={notes}
              onChange={onNotesChange}
              toolActive={interactive && tool === 'text'}
              onActivateTextTool={onActivateTextTool}
              onExitTextTool={onExitTextTool}
            />
          )}
        </div>
      </div>
    ) : null;

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {searchOpen && (
          <PDFSearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            matchCount={searchRects.length}
            activeIndex={activeMatchIdx}
            onPrev={goPrev}
            onNext={goNext}
            onClose={() => onSearchClose?.()}
          />
        )}
        <PDFViewer
          document={document}
          zoom={zoom}
          onZoomChange={onZoomChange}
          onCanvasDimensions={handleCanvasDimensions}
          onPageReady={handlePageReady}
          searchHighlights={searchOpen ? searchRects : undefined}
          searchActiveIndex={searchOpen ? activeMatchIdx : undefined}
          overlay={overlay}
        />
      </div>
    );
  },
);

export default PDFWithDrawing;
