'use client';
import {
  forwardRef, useRef, useState, useEffect, useCallback, useImperativeHandle,
} from 'react';
import type { BlankPage, CanvasImage, TextNote } from '@/types';
import { getDrawingCursor } from '@/lib/drawing';
import type { Tool, PenType } from '@/lib/drawing';
import TextNotesLayer from './TextNotesLayer';

const PAGE_W = 816;
const PAGE_H = 1056;
const MIN_IMG = 40;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;

function clampZ(z: number) {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

interface ImageInteraction {
  type: 'move' | 'resize';
  imageId: string;
  corner?: Corner;
  startX: number; startY: number;
  startImgX: number; startImgY: number;
  startImgW: number; startImgH: number;
}

// Line tool state: idle waiting for first click, or active waiting for second click
type LineState =
  | { phase: 'idle' }
  | { phase: 'active'; start: { x: number; y: number }; snapshot: ImageData };

function applyCtx(
  ctx: CanvasRenderingContext2D,
  tool: Tool, penType: PenType,
  color: string, strokeSize: number,
) {
  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = strokeSize * 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    if (penType === 'normal') {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else if (penType === 'marker') {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = strokeSize * 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = strokeSize * 7;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
    }
  }
}

export interface DrawingCanvasHandle {
  clear: () => void;
  insertImage?: (dataUrl: string) => void;
  undo?: () => void;
}

interface Props {
  blankPage: BlankPage;
  onSaveData: (id: string, data: string) => void;
  onSaveImages: (id: string, images: CanvasImage[]) => void;
  tool: Tool;
  penType: PenType;
  color: string;
  strokeSize: number;
  zoom: number;
  onZoomChange: (z: number) => void;
  notes?: TextNote[];
  onNotesChange?: (notes: TextNote[]) => void;
  onActivateTextTool?: () => void;
  onExitTextTool?: () => void;
}

const BlankPageCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function BlankPageCanvas(
    { blankPage, onSaveData, onSaveImages, tool, penType, color, strokeSize, zoom, onZoomChange, notes, onNotesChange, onActivateTextTool, onExitTextTool },
    ref,
  ) {
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isPenDown    = useRef(false);
    const lastPt       = useRef<{ x: number; y: number } | null>(null);

    const zoomRef     = useRef(zoom);
    const liveZoomRef = useRef(zoom);
    zoomRef.current   = zoom;

    const toolRef = useRef(tool);
    toolRef.current = tool;

    const lastPinchDistRef = useRef<number | null>(null);

    const [cssDims, setCssDims]   = useState({ w: PAGE_W, h: PAGE_H });
    const [images, setImages]     = useState<CanvasImage[]>(blankPage.images ?? []);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const imagesRef      = useRef(images);
    imagesRef.current    = images;
    const interactionRef = useRef<ImageInteraction | null>(null);

    // Two-click line tool state
    const lineStateRef = useRef<LineState>({ phase: 'idle' });

    // Undo stack — stores up to 10 canvas snapshots (data URLs)
    const undoStack = useRef<string[]>([]);

    function computeCss(containerWidth: number, z: number) {
      const baseW = Math.min(containerWidth - 48, PAGE_W);
      const w = baseW * z;
      return { w, h: w * (PAGE_H / PAGE_W) };
    }

    // Cancel an in-progress line (restores snapshot, resets state)
    const cancelLine = useCallback(() => {
      const ls = lineStateRef.current;
      if (ls.phase !== 'active') return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.putImageData(ls.snapshot, 0, 0);
      lineStateRef.current = { phase: 'idle' };
    }, []);

    // Cancel line when tool changes away from 'line'
    useEffect(() => {
      if (tool !== 'line') cancelLine();
    }, [tool, cancelLine]);

    // ── Canvas setup on page switch ────────────────────────────────────────
    useEffect(() => {
      cancelLine();
      isPenDown.current = false;
      undoStack.current = [];

      const canvas    = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const { w: cssW, h: cssH } = computeCss(container.getBoundingClientRect().width, zoomRef.current);

      canvas.width  = PAGE_W * dpr;
      canvas.height = PAGE_H * dpr;
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      setCssDims({ w: cssW, h: cssH });

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, PAGE_W, PAGE_H);

      if (blankPage.canvasData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H);
        img.src = blankPage.canvasData;
      }

      setImages(blankPage.images ?? []);
      setSelectedId(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blankPage.id]);

    // ── Zoom: update only CSS size, never touch canvas pixels ─────────────
    useEffect(() => {
      liveZoomRef.current = zoom;
      const canvas    = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const { w: cssW, h: cssH } = computeCss(container.getBoundingClientRect().width, zoom);
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      setCssDims({ w: cssW, h: cssH });
    }, [zoom]);

    // ── Ctrl/Cmd + scroll zoom ─────────────────────────────────────────────
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const next = clampZ(liveZoomRef.current + (e.deltaY < 0 ? 0.1 : -0.1));
        liveZoomRef.current = next;
        onZoomChange(next);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }, [onZoomChange]);

    // ── Pinch-to-zoom ──────────────────────────────────────────────────────
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const onTouchStart = (e: TouchEvent) => {
        // Suppress pinch zoom while a drawing tool is active
        if (toolRef.current !== 'text') { lastPinchDistRef.current = null; return; }
        if (e.touches.length === 2) {
          lastPinchDistRef.current = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
        }
      };
      const onTouchMove = (e: TouchEvent) => {
        if (toolRef.current !== 'text') { lastPinchDistRef.current = null; return; }
        if (e.touches.length !== 2 || lastPinchDistRef.current === null) return;
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const next = clampZ(liveZoomRef.current * (dist / lastPinchDistRef.current));
        lastPinchDistRef.current = dist;
        liveZoomRef.current = next;
        onZoomChange(next);
      };
      const onTouchEnd = () => { lastPinchDistRef.current = null; };

      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd);
      return () => {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
      };
    }, [onZoomChange]);

    // ── Coordinate helpers ─────────────────────────────────────────────────
    const clientToLogical = (clientX: number, clientY: number) => {
      const r = canvasRef.current!.getBoundingClientRect();
      return {
        x: (clientX - r.left) * (PAGE_W / r.width),
        y: (clientY - r.top) * (PAGE_H / r.height),
      };
    };

    const evToLogical = (e: { clientX: number; clientY: number }) =>
      clientToLogical(e.clientX, e.clientY);

    // ── Stroke persistence ─────────────────────────────────────────────────
    const saveStrokes = useCallback(() => {
      const canvas = canvasRef.current;
      if (canvas) onSaveData(blankPage.id, canvas.toDataURL('image/png'));
    }, [blankPage.id, onSaveData]);

    // ── Image hit-test ─────────────────────────────────────────────────────
    function imageAtPoint(x: number, y: number) {
      return [...imagesRef.current].reverse().find(
        img => x >= img.x && x <= img.x + img.width && y >= img.y && y <= img.y + img.height,
      );
    }

    // ── Drawing ────────────────────────────────────────────────────────────

    const startDraw = (pos: { x: number; y: number }) => {
      // Image interaction takes priority for all tools
      const hit = imageAtPoint(pos.x, pos.y);
      if (hit) {
        cancelLine();
        interactionRef.current = {
          type: 'move', imageId: hit.id,
          startX: pos.x, startY: pos.y,
          startImgX: hit.x, startImgY: hit.y,
          startImgW: hit.width, startImgH: hit.height,
        };
        setSelectedId(hit.id);
        canvasRef.current!.style.cursor = 'grabbing';
        return;
      }

      setSelectedId(null);

      if (tool === 'text') return;

      if (tool === 'line') {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const ls = lineStateRef.current;
        if (ls.phase === 'idle') {
          // Push undo snapshot before first line click
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
          // Second click: commit the line
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
          saveStrokes();
        }
        return;
      }

      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      // Push undo snapshot before starting a stroke
      undoStack.current = [...undoStack.current, canvas.toDataURL('image/png')].slice(-10);
      isPenDown.current = true;
      lastPt.current    = pos;
      ctx.save();
      applyCtx(ctx, tool, penType, color, strokeSize);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const continueDraw = (pos: { x: number; y: number }) => {
      const it = interactionRef.current;
      if (it?.type === 'move') {
        const dx = pos.x - it.startX;
        const dy = pos.y - it.startY;
        setImages(prev => prev.map(img => {
          if (img.id !== it.imageId) return img;
          return {
            ...img,
            x: Math.max(0, Math.min(PAGE_W - img.width, it.startImgX + dx)),
            y: Math.max(0, Math.min(PAGE_H - img.height, it.startImgY + dy)),
          };
        }));
        return;
      }

      if (tool === 'line') {
        const ls = lineStateRef.current;
        if (ls.phase !== 'active') return;
        const canvas = canvasRef.current;
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

      if (!isPenDown.current || !lastPt.current) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.save();
      applyCtx(ctx, tool, penType, color, strokeSize);
      ctx.beginPath();
      ctx.moveTo(lastPt.current.x, lastPt.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
      lastPt.current = pos;
    };

    const stopDraw = () => {
      // Line tool doesn't commit on mouseup — it waits for the second click
      if (tool === 'line') return;

      const it = interactionRef.current;
      if (it?.type === 'move') {
        interactionRef.current = null;
        const canvas = canvasRef.current;
        if (canvas) canvas.style.cursor = getDrawingCursor(tool, penType);
        onSaveImages(blankPage.id, imagesRef.current);
        return;
      }

      if (!isPenDown.current) return;
      isPenDown.current = false;
      lastPt.current    = null;
      saveStrokes();
    };

    // Update cursor on hover
    const updateCursor = (pos: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas || interactionRef.current) return;
      const hit = imageAtPoint(pos.x, pos.y);
      canvas.style.cursor = hit ? 'move' : getDrawingCursor(tool, penType);
    };

    // ── Resize handles ─────────────────────────────────────────────────────
    function applyResize(img: CanvasImage, it: ImageInteraction, dx: number): CanvasImage {
      const aspect = it.startImgW / it.startImgH;
      let newW: number, newX = it.startImgX, newY = it.startImgY;
      if (it.corner === 'se' || it.corner === 'ne') {
        newW = Math.max(MIN_IMG, it.startImgW + dx);
      } else {
        newW = Math.max(MIN_IMG, it.startImgW - dx);
        newX = it.startImgX + it.startImgW - newW;
      }
      const newH = newW / aspect;
      if (it.corner === 'ne' || it.corner === 'nw') {
        newY = it.startImgY + it.startImgH - newH;
      }
      return { ...img, x: newX, y: newY, width: newW, height: newH };
    }

    const handleResizePointerMove = (e: React.PointerEvent) => {
      const it = interactionRef.current;
      if (!it || it.type !== 'resize') return;
      const { x } = clientToLogical(e.clientX, e.clientY);
      setImages(prev => prev.map(img =>
        img.id !== it.imageId ? img : applyResize(img, it, x - it.startX),
      ));
    };

    const handleResizePointerUp = () => {
      if (!interactionRef.current) return;
      interactionRef.current = null;
      onSaveImages(blankPage.id, imagesRef.current);
    };

    // ── Clear ──────────────────────────────────────────────────────────────
    const clearCanvas = useCallback(() => {
      cancelLine();
      const canvas = canvasRef.current;
      const ctx    = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      undoStack.current = [...undoStack.current, canvas.toDataURL('image/png')].slice(-10);
      ctx.clearRect(0, 0, PAGE_W, PAGE_H);
      setImages([]);
      setSelectedId(null);
      onSaveData(blankPage.id, canvas.toDataURL('image/png'));
      onSaveImages(blankPage.id, []);
    }, [blankPage.id, onSaveData, onSaveImages, cancelLine]);

    // ── Undo ──────────────────────────────────────────────────────────────
    const undo = useCallback(() => {
      const stack = undoStack.current;
      if (stack.length === 0) return;
      const prev = stack[stack.length - 1];
      undoStack.current = stack.slice(0, -1);
      cancelLine();
      isPenDown.current = false;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, PAGE_W, PAGE_H);
        ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H);
        onSaveData(blankPage.id, prev);
      };
      img.src = prev;
    }, [blankPage.id, onSaveData, cancelLine]);

    // ── Insert image ───────────────────────────────────────────────────────
    const insertImage = useCallback((dataUrl: string) => {
      const el = new Image();
      el.onload = () => {
        const aspect = el.naturalWidth / el.naturalHeight;
        let w = Math.min(el.naturalWidth, PAGE_W * 0.55);
        let h = w / aspect;
        if (h > PAGE_H * 0.55) { h = PAGE_H * 0.55; w = h * aspect; }
        const newImg: CanvasImage = {
          id: crypto.randomUUID(),
          src: dataUrl,
          x: Math.round((PAGE_W - w) / 2),
          y: Math.round((PAGE_H - h) / 2),
          width: Math.round(w),
          height: Math.round(h),
        };
        setImages(prev => {
          const next = [...prev, newImg];
          onSaveImages(blankPage.id, next);
          return next;
        });
        setSelectedId(newImg.id);
      };
      el.src = dataUrl;
    }, [blankPage.id, onSaveImages]);

    useImperativeHandle(ref, () => ({ clear: clearCanvas, insertImage, undo }), [clearCanvas, insertImage, undo]);

    useEffect(() => {
      const fn = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setSelectedId(null);
          cancelLine();
        }
      };
      window.addEventListener('keydown', fn);
      return () => window.removeEventListener('keydown', fn);
    }, [cancelLine]);

    // ── Render ─────────────────────────────────────────────────────────────
    const scale = cssDims.w / PAGE_W;
    const H = 10; // handle diameter px

    const isDark  = blankPage.bgTheme === 'dark';
    const pageBg  = isDark ? '#1e1e2e' : '#ffffff';
    const dotClr  = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';

    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
      }}>
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            padding: 24,
          }}
        >
          <div style={{
            position: 'relative', display: 'inline-block', flexShrink: 0,
            backgroundColor: pageBg,
            backgroundImage: `radial-gradient(circle, ${dotClr} 1.2px, transparent 1.2px)`,
            backgroundSize: `${Math.round(scale * 24)}px ${Math.round(scale * 24)}px`,
            borderRadius: 2,
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          }}>

            {/* ── Layer 1: images ── */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {images.map(img => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: img.x * scale, top: img.y * scale,
                    width: img.width * scale, height: img.height * scale,
                    display: 'block', userSelect: 'none',
                  }}
                />
              ))}
            </div>

            {/* ── Layer 2: stroke canvas ── */}
            <canvas
              ref={canvasRef}
              onMouseDown={(e) => { if (tool === 'text') return; startDraw(evToLogical(e.nativeEvent)); }}
              onMouseMove={(e) => {
                if (tool === 'text') return;
                const pos = evToLogical(e.nativeEvent);
                updateCursor(pos);
                continueDraw(pos);
              }}
              onMouseUp={() => { if (tool !== 'text') stopDraw(); }}
              onMouseLeave={() => { if (tool !== 'text') stopDraw(); }}
              onTouchStart={(e) => {
                if (tool === 'text') return;
                e.preventDefault();
                if (e.touches.length === 1) startDraw(evToLogical(e.touches[0]));
              }}
              onTouchMove={(e) => {
                if (tool === 'text') return;
                e.preventDefault();
                if (e.touches.length === 1) continueDraw(evToLogical(e.touches[0]));
              }}
              onTouchEnd={() => { if (tool !== 'text') stopDraw(); }}
              style={{
                display: 'block',
                position: 'relative',
                cursor: tool === 'text' ? 'default' : getDrawingCursor(tool, penType),
                touchAction: tool !== 'text' ? 'none' : 'pan-y',
                pointerEvents: tool === 'text' ? 'none' : 'auto',
              }}
            />

            {/* ── Layer 3: selection outline + resize handles ── */}
            {/* zIndex 1 here, text notes layer is zIndex 10 */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 1 }}>
              {images.filter(img => img.id === selectedId).map(img => (
                <div key={img.id}>
                  <div style={{
                    position: 'absolute',
                    left: img.x * scale - 1, top: img.y * scale - 1,
                    width: img.width * scale + 2, height: img.height * scale + 2,
                    border: '2px solid #5965d9',
                    borderRadius: 1,
                    pointerEvents: 'none',
                  }} />
                  {CORNERS.map(corner => (
                    <div
                      key={corner}
                      style={{
                        position: 'absolute',
                        left: (corner.includes('w') ? img.x : img.x + img.width) * scale - H / 2,
                        top:  (corner.includes('n') ? img.y : img.y + img.height) * scale - H / 2,
                        width: H, height: H,
                        background: '#ffffff',
                        border: '1.5px solid #5965d9',
                        borderRadius: 2,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                        cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const { x, y } = clientToLogical(e.clientX, e.clientY);
                        interactionRef.current = {
                          type: 'resize', imageId: img.id, corner,
                          startX: x, startY: y,
                          startImgX: img.x, startImgY: img.y,
                          startImgW: img.width, startImgH: img.height,
                        };
                      }}
                      onPointerMove={handleResizePointerMove}
                      onPointerUp={handleResizePointerUp}
                      onPointerCancel={handleResizePointerUp}
                    />
                  ))}
                </div>
              ))}
            </div>
            {/* ── Layer 4: text notes ── */}
            {notes !== undefined && onNotesChange && (
              <TextNotesLayer
                notes={notes}
                onChange={onNotesChange}
                toolActive={tool === 'text'}
                onActivateTextTool={onActivateTextTool}
                onExitTextTool={onExitTextTool}
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default BlankPageCanvas;
