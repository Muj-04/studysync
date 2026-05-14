'use client';
import { forwardRef, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import type { BlankPage } from '@/types';
import type { Tool, PenType } from '@/lib/drawing';

const PAGE_W = 816;
const PAGE_H = 1056;

function applyCtx(
  ctx: CanvasRenderingContext2D,
  tool: Tool,
  penType: PenType,
  color: string,
  strokeSize: number,
) {
  ctx.globalCompositeOperation = 'source-over';
  if (tool === 'eraser') {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = strokeSize * 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  } else if (penType === 'normal') {
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
    // highlighter
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeSize * 7;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
  }
}

export interface DrawingCanvasHandle {
  clear: () => void;
}

interface Props {
  blankPage: BlankPage;
  onSaveData: (id: string, data: string) => void;
  tool: Tool;
  penType: PenType;
  color: string;
  strokeSize: number;
}

const BlankPageCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function BlankPageCanvas({ blankPage, onSaveData, tool, penType, color, strokeSize }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDrawing = useRef(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);

    // ── Canvas setup on blank-page change ──────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const { width } = container.getBoundingClientRect();
      const cssW = Math.min(width - 48, PAGE_W);
      const cssH = cssW * (PAGE_H / PAGE_W);

      canvas.width = PAGE_W * dpr;
      canvas.height = PAGE_H * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, PAGE_W, PAGE_H);

      if (blankPage.canvasData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H);
        img.src = blankPage.canvasData;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blankPage.id]);

    // ── Coordinate mapping ─────────────────────────────────────────────────
    const getPos = (e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (PAGE_W / rect.width),
        y: (e.clientY - rect.top) * (PAGE_H / rect.height),
      };
    };

    const saveCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (canvas) onSaveData(blankPage.id, canvas.toDataURL('image/png'));
    }, [blankPage.id, onSaveData]);

    // ── Drawing ────────────────────────────────────────────────────────────
    const startDraw = (pos: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      isDrawing.current = true;
      lastPos.current = pos;
      ctx.save();
      applyCtx(ctx, tool, penType, color, strokeSize);
      const r = ctx.lineWidth / 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const continueDraw = (pos: { x: number; y: number }) => {
      if (!isDrawing.current || !lastPos.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
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

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, PAGE_W, PAGE_H);
      onSaveData(blankPage.id, canvas.toDataURL('image/png'));
    }, [blankPage.id, onSaveData]);

    useImperativeHandle(ref, () => ({ clear: clearCanvas }), [clearCanvas]);

    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          ref={containerRef}
          style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 24 }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={(e) => startDraw(getPos(e.nativeEvent))}
            onMouseMove={(e) => continueDraw(getPos(e.nativeEvent))}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={(e) => { e.preventDefault(); if (e.touches.length === 1) startDraw(getPos(e.touches[0])); }}
            onTouchMove={(e) => { e.preventDefault(); if (e.touches.length === 1) continueDraw(getPos(e.touches[0])); }}
            onTouchEnd={stopDraw}
            style={{
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
              touchAction: 'none',
              borderRadius: 2,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      </div>
    );
  },
);

export default BlankPageCanvas;
