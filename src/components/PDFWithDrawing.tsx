'use client';
import { forwardRef, useRef, useEffect, useState, useCallback, useImperativeHandle } from 'react';
import PDFViewer from './PDFViewer';
import PDFSearchBar from './PDFSearchBar';
import TextNotesLayer from './TextNotesLayer';
import type { HighlightRect } from './PDFViewer';
import type { PDFDocument, TextNote, PDFPageImage } from '@/types';
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
  loadData?: (data: string) => void;
  insertImage?: (dataUrl: string) => void;
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
    const fontH = Math.abs(d) || Math.abs(c) || 10;

    let start = 0;
    while (true) {
      const found = lower.indexOf(q, start);
      if (found === -1) break;
      const startFrac = found / item.str.length;
      const endFrac   = Math.min((found + q.length) / item.str.length, 1);
      const x0 = e + startFrac * item.width;
      const x1 = e + endFrac   * item.width;
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

// ── Image interaction helpers ─────────────────────────────────────────────────

// Handle size in pixels for corner hit-testing
const HANDLE_PX = 12;

function getHitCorner(
  mx: number, my: number,
  img: PDFPageImage,
  w: number, h: number,
): 'tl' | 'tr' | 'bl' | 'br' | null {
  const hx = HANDLE_PX / w;
  const hy = HANDLE_PX / h;
  const { x, y, width: iw, height: ih } = img;
  const corners: Array<['tl' | 'tr' | 'bl' | 'br', number, number]> = [
    ['tl', x,      y],
    ['tr', x + iw, y],
    ['bl', x,      y + ih],
    ['br', x + iw, y + ih],
  ];
  for (const [key, cx, cy] of corners) {
    if (Math.abs(mx - cx) <= hx && Math.abs(my - cy) <= hy) return key;
  }
  return null;
}

function hitImage(mx: number, my: number, img: PDFPageImage): boolean {
  return mx >= img.x && mx <= img.x + img.width && my >= img.y && my <= img.y + img.height;
}

// ── ImageToolbar ──────────────────────────────────────────────────────────────

function ImageToolbar({
  image, canvasDims, onSizeChange, onLock, onDelete,
}: {
  image: PDFPageImage;
  canvasDims: { w: number; h: number };
  onSizeChange: (delta: number) => void;
  onLock: () => void;
  onDelete: () => void;
}) {
  const [lockPending, setLockPending] = useState(false);

  const imgLeft = image.x * canvasDims.w;
  const imgTop  = image.y * canvasDims.h;
  const TOOLBAR_H = 34;
  const GAP = 6;
  const toolTop  = Math.max(4, imgTop - TOOLBAR_H - GAP);
  const toolLeft = Math.max(4, Math.min(imgLeft, canvasDims.w - 320));

  const btnBase: React.CSSProperties = {
    height: 26, padding: '0 10px',
    display: 'flex', alignItems: 'center', gap: 4,
    borderRadius: 5,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
    whiteSpace: 'nowrap', flexShrink: 0,
    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
  };

  const divider = (
    <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
  );

  return (
    <div
      style={{
        position: 'absolute', left: toolLeft, top: toolTop, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '0 8px',
        height: TOOLBAR_H,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        style={btnBase}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
        onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' })}
        onClick={() => onSizeChange(-0.05)}
        title="Shrink image"
      >
        −
      </button>
      <button
        style={btnBase}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
        onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' })}
        onClick={() => onSizeChange(+0.05)}
        title="Grow image"
      >
        +
      </button>
      {divider}
      {lockPending ? (
        <>
          <span style={{ fontSize: 10.5, color: '#f59e0b', whiteSpace: 'nowrap', maxWidth: 200 }}>
            Once locked, image cannot be moved or resized.
          </span>
          <button
            style={{ ...btnBase, color: '#f59e0b', borderColor: '#f59e0b' }}
            onClick={() => { onLock(); setLockPending(false); }}
          >
            Confirm Lock
          </button>
          <button
            style={btnBase}
            onClick={() => setLockPending(false)}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' })}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          style={btnBase}
          onClick={() => setLockPending(true)}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', color: 'var(--text-2)' })}
        >
          Lock Image
        </button>
      )}
      {divider}
      <button
        style={{ ...btnBase, color: '#ef4444', borderColor: '#ef4444' }}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(239,68,68,0.1)' })}
        onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)' })}
        onClick={onDelete}
        title="Remove image"
      >
        Remove
      </button>
    </div>
  );
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
  searchOpen?: boolean;
  onSearchClose?: () => void;
  pageImages?: PDFPageImage[];
  onSavePageImages?: (images: PDFPageImage[]) => void;
}

// ── Interaction state type ────────────────────────────────────────────────────

type DragState =
  | { kind: 'none' }
  | { kind: 'drag';   imageId: string; startMX: number; startMY: number; startImg: PDFPageImage }
  | { kind: 'resize'; imageId: string; corner: 'tl' | 'tr' | 'bl' | 'br'; startMX: number; startMY: number; startImg: PDFPageImage };

// ── Component ─────────────────────────────────────────────────────────────────

const PDFWithDrawing = forwardRef<DrawingCanvasHandle, Props>(
  function PDFWithDrawing({
    document, tool, penType, color, strokeSize, savedData, onSave,
    zoom = 1, onZoomChange, interactive = true,
    notes, onNotesChange, onActivateTextTool, onExitTextTool,
    searchOpen = false, onSearchClose,
    pageImages, onSavePageImages,
  }, ref) {
    const drawCanvasRef   = useRef<HTMLCanvasElement>(null);
    const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef      = useRef<HTMLDivElement>(null);
    const isDrawing       = useRef(false);
    const lastPos         = useRef<{ x: number; y: number } | null>(null);
    const [canvasDims, setCanvasDims] = useState<{ w: number; h: number } | null>(null);
    const canvasDimsRef = useRef(canvasDims);
    canvasDimsRef.current = canvasDims;

    const lineStateRef = useRef<LineState>({ phase: 'idle' });
    const undoStack    = useRef<string[]>([]);

    // ── Image annotation state ────────────────────────────────────────────────
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [dragImages, setDragImages] = useState<PDFPageImage[] | null>(null);

    // Stable refs for callbacks
    const pageImagesRef = useRef<PDFPageImage[]>([]);
    pageImagesRef.current = pageImages ?? [];
    const onSavePageImagesRef = useRef<((imgs: PDFPageImage[]) => void) | undefined>(undefined);
    onSavePageImagesRef.current = onSavePageImages;
    const selectedImageIdRef = useRef<string | null>(null);
    selectedImageIdRef.current = selectedImageId;
    const dragRef = useRef<DragState>({ kind: 'none' });

    // displayImages: use dragImages during interaction, props otherwise
    const displayImages = dragImages ?? (pageImages ?? []);

    // ── Search state ──────────────────────────────────────────────────────────
    const [searchQuery,    setSearchQuery]    = useState('');
    const [searchRects,    setSearchRects]    = useState<HighlightRect[]>([]);
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);
    const pdfPageRef     = useRef<PDFPageProxy | null>(null);
    const cssViewportRef = useRef<PageViewport | null>(null);
    const searchQueryRef = useRef('');
    searchQueryRef.current = searchQuery;

    useEffect(() => {
      if (!searchOpen) { setSearchQuery(''); setSearchRects([]); setActiveMatchIdx(0); }
    }, [searchOpen]);

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

    const handlePageReady = useCallback((page: PDFPageProxy, cssVp: PageViewport) => {
      pdfPageRef.current    = page;
      cssViewportRef.current = cssVp;
      const q = searchQueryRef.current.trim();
      if (!q) { setSearchRects([]); return; }
      searchPage(page, cssVp, q).then((rects) => { setSearchRects(rects); setActiveMatchIdx(0); });
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

    // Deselect image on page change
    useEffect(() => {
      setSelectedImageId(null);
      setDragImages(null);
    }, [document.currentPage]);

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
      const remote = remoteCanvasRef.current;
      if (remote) {
        remote.width  = Math.round(w * dpr);
        remote.height = Math.round(h * dpr);
        remote.style.width  = `${w}px`;
        remote.style.height = `${h}px`;
        const rCtx = remote.getContext('2d')!;
        rCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rCtx.clearRect(0, 0, w, h);
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
      img.onload = () => { ctx.clearRect(0, 0, dims.w, dims.h); ctx.drawImage(img, 0, 0, dims.w, dims.h); onSave(prev); };
      img.src = prev;
    }, [cancelLine, onSave]);

    // loadData: paint a peer's broadcast onto the remote overlay canvas
    const loadData = useCallback((data: string) => {
      const canvas = remoteCanvasRef.current;
      const dims = canvasDimsRef.current;
      if (!canvas || !dims) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, dims.w, dims.h);
        ctx.drawImage(img, 0, 0, dims.w, dims.h);
      };
      img.src = data;
    }, []);

    // insertImage: adds image to the annotations layer (40% width, centered)
    const insertImage = useCallback((dataUrl: string) => {
      const el = new Image();
      el.onload = () => {
        const aspect = el.naturalWidth / el.naturalHeight;
        let w = 0.40;
        let h = w / aspect;
        if (h > 0.80) { h = 0.80; w = h * aspect; }
        const newImg: PDFPageImage = {
          id: Math.random().toString(36).slice(2),
          src: dataUrl,
          x: (1 - w) / 2,
          y: (1 - h) / 2,
          width: w,
          height: h,
        };
        const updated = [...pageImagesRef.current, newImg];
        onSavePageImagesRef.current?.(updated);
      };
      el.src = dataUrl;
    }, []);

    useImperativeHandle(ref, () => ({ clear: clearCanvas, undo: undoCanvas, loadData, insertImage }), [clearCanvas, undoCanvas, loadData, insertImage]);

    // ── Image interaction ─────────────────────────────────────────────────────

    // Global mouse move/up to handle dragging outside the overlay
    useEffect(() => {
      const getOverlayNorm = (e: MouseEvent): { x: number; y: number } => {
        const el = overlayRef.current;
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top)  / rect.height,
        };
      };

      const onMove = (e: MouseEvent) => {
        const ds = dragRef.current;
        if (ds.kind === 'none') return;
        const { x: mx, y: my } = getOverlayNorm(e);

        setDragImages((prev) => {
          const imgs = prev ?? pageImagesRef.current;
          return imgs.map((img) => {
            if (img.id !== ds.imageId) return img;
            if (ds.kind === 'drag') {
              const dx = mx - ds.startMX;
              const dy = my - ds.startMY;
              return {
                ...img,
                x: Math.max(0, Math.min(1 - img.width,  ds.startImg.x + dx)),
                y: Math.max(0, Math.min(1 - img.height, ds.startImg.y + dy)),
              };
            }
            // resize
            const dx = mx - ds.startMX;
            const dy = my - ds.startMY;
            const si = ds.startImg;
            const MIN = 0.04;
            let { x, y, width, height } = si;
            switch (ds.corner) {
              case 'br': width  = Math.max(MIN, si.width + dx);  height = Math.max(MIN, si.height + dy); break;
              case 'bl': width  = Math.max(MIN, si.width - dx);  height = Math.max(MIN, si.height + dy); x = si.x + si.width - width; break;
              case 'tr': width  = Math.max(MIN, si.width + dx);  height = Math.max(MIN, si.height - dy); y = si.y + si.height - height; break;
              case 'tl': width  = Math.max(MIN, si.width - dx);  height = Math.max(MIN, si.height - dy); x = si.x + si.width - width; y = si.y + si.height - height; break;
            }
            return { ...img, x, y, width, height };
          });
        });
      };

      const onUp = () => {
        if (dragRef.current.kind === 'none') return;
        dragRef.current = { kind: 'none' };
        setDragImages((current) => {
          if (current) onSavePageImagesRef.current?.(current);
          return null;
        });
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    const handleOverlayMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive) return;
      const el = overlayRef.current;
      const dims = canvasDimsRef.current;
      if (!el || !dims) return;
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top)  / rect.height;
      const imgs = pageImagesRef.current;
      const selId = selectedImageIdRef.current;

      // Check corner handles of selected image first
      if (selId) {
        const selImg = imgs.find((i) => i.id === selId);
        if (selImg) {
          const corner = getHitCorner(mx, my, selImg, dims.w, dims.h);
          if (corner) {
            dragRef.current = { kind: 'resize', imageId: selId, corner, startMX: mx, startMY: my, startImg: selImg };
            e.stopPropagation(); e.preventDefault();
            return;
          }
          if (hitImage(mx, my, selImg)) {
            dragRef.current = { kind: 'drag', imageId: selId, startMX: mx, startMY: my, startImg: selImg };
            e.stopPropagation(); e.preventDefault();
            return;
          }
        }
      }

      // Hit test other images (top = last in array)
      for (let i = imgs.length - 1; i >= 0; i--) {
        const img = imgs[i];
        if (hitImage(mx, my, img)) {
          setSelectedImageId(img.id);
          dragRef.current = { kind: 'drag', imageId: img.id, startMX: mx, startMY: my, startImg: img };
          e.stopPropagation(); e.preventDefault();
          return;
        }
      }

      // Click on empty → deselect
      setSelectedImageId(null);
    }, [interactive]);

    // ── Image handlers ────────────────────────────────────────────────────────

    const handleSizeChange = useCallback((delta: number) => {
      const selId = selectedImageIdRef.current;
      if (!selId) return;
      const imgs = pageImagesRef.current;
      const updated = imgs.map((img) => {
        if (img.id !== selId) return img;
        const aspect = img.width / img.height;
        const newW = Math.max(0.05, Math.min(0.98, img.width + delta));
        const newH = newW / aspect;
        const cx = img.x + img.width  / 2;
        const cy = img.y + img.height / 2;
        return {
          ...img,
          width: newW, height: newH,
          x: Math.max(0, Math.min(1 - newW, cx - newW / 2)),
          y: Math.max(0, Math.min(1 - newH, cy - newH / 2)),
        };
      });
      onSavePageImagesRef.current?.(updated);
    }, []);

    const handleLockImage = useCallback(() => {
      const selId = selectedImageIdRef.current;
      if (!selId) return;
      const imgs = pageImagesRef.current;
      const img  = imgs.find((i) => i.id === selId);
      const dims = canvasDimsRef.current;
      const canvas = drawCanvasRef.current;
      if (!img || !dims || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const el = new Image();
      el.onload = () => {
        undoStack.current = [...undoStack.current, canvas.toDataURL('image/png')].slice(-10);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(el, img.x * dims.w, img.y * dims.h, img.width * dims.w, img.height * dims.h);
        ctx.restore();
        onSave(canvas.toDataURL('image/png'));
      };
      el.src = img.src;
      const updated = imgs.filter((i) => i.id !== selId);
      setSelectedImageId(null);
      onSavePageImagesRef.current?.(updated);
    }, [onSave]);

    const handleDeleteImage = useCallback(() => {
      const selId = selectedImageIdRef.current;
      if (!selId) return;
      const updated = pageImagesRef.current.filter((i) => i.id !== selId);
      setSelectedImageId(null);
      onSavePageImagesRef.current?.(updated);
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────

    const canDrawNow = interactive && tool !== 'text' && tool !== 'cursor';
    const isInteractingImages = interactive && tool === 'cursor';

    const selectedImage = selectedImageId ? displayImages.find((i) => i.id === selectedImageId) ?? null : null;

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
          {/* Layer 0 — remote peers' drawings */}
          <canvas
            ref={remoteCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, pointerEvents: 'none' }}
          />

          {/* Layer 1 — page image annotations */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: canvasDims.w, height: canvasDims.h,
            zIndex: 1, pointerEvents: 'none', overflow: 'hidden',
          }}>
            {displayImages.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left:   img.x      * canvasDims.w,
                  top:    img.y      * canvasDims.h,
                  width:  img.width  * canvasDims.w,
                  height: img.height * canvasDims.h,
                  pointerEvents: 'none',
                  userSelect: 'none',
                  outline: selectedImageId === img.id ? '2px solid var(--accent)' : '2px solid transparent',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>

          {/* Layer 2 — local drawing canvas */}
          <canvas
            ref={drawCanvasRef}
            style={{
              position: 'absolute', top: 0, left: 0,
              zIndex: 2,
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

          {/* Layer 3 — image interaction overlay (cursor mode only) */}
          {isInteractingImages && (
            <div
              ref={overlayRef}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: canvasDims.w, height: canvasDims.h,
                zIndex: 3,
                pointerEvents: 'auto',
                cursor: 'default',
              }}
              onMouseDown={handleOverlayMouseDown}
            >
              {/* Corner resize handles for selected image */}
              {selectedImage && (['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
                const hx = corner.includes('r') ? selectedImage.x + selectedImage.width  : selectedImage.x;
                const hy = corner.includes('b') ? selectedImage.y + selectedImage.height : selectedImage.y;
                const cursor =
                  corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize';
                return (
                  <div
                    key={corner}
                    style={{
                      position: 'absolute',
                      left:   hx * canvasDims.w - 5,
                      top:    hy * canvasDims.h - 5,
                      width: 10, height: 10,
                      borderRadius: 2,
                      background: 'var(--accent)',
                      border: '1.5px solid #fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                      cursor,
                      zIndex: 1,
                      pointerEvents: 'none',
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* ImageToolbar */}
          {isInteractingImages && selectedImage && (
            <ImageToolbar
              image={selectedImage}
              canvasDims={canvasDims}
              onSizeChange={handleSizeChange}
              onLock={handleLockImage}
              onDelete={handleDeleteImage}
            />
          )}

          {/* Layer 4 — text notes */}
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
          disablePinch={canDrawNow}
        />
      </div>
    );
  },
);

export default PDFWithDrawing;
