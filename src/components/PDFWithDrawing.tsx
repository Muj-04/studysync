'use client';
import { forwardRef, useRef, useEffect, useState, useCallback, useImperativeHandle } from 'react';
import PDFViewer from './PDFViewer';
import type { PDFDocument } from '@/types';
import type { Tool, PenType } from '@/lib/drawing';

// destination-out erases to transparent so the PDF shows through
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

export interface DrawingCanvasHandle {
  clear: () => void;
}

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
}

const PDFWithDrawing = forwardRef<DrawingCanvasHandle, Props>(
  function PDFWithDrawing({ document, tool, penType, color, strokeSize, savedData, onSave, zoom = 1, onZoomChange }, ref) {
    const drawCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);
    const [canvasDims, setCanvasDims] = useState<{ w: number; h: number } | null>(null);

    const handleCanvasDimensions = useCallback((w: number, h: number) => {
      setCanvasDims((prev) => (prev?.w === w && prev?.h === h ? prev : { w, h }));
    }, []);

    // Re-setup draw canvas on page change or when PDF reports new dimensions
    useEffect(() => {
      const canvas = drawCanvasRef.current;
      if (!canvas || !canvasDims) return;
      const { w, h } = canvasDims;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (savedData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, w, h);
        img.src = savedData;
      }
      // savedData intentionally omitted — only reload on page/dim change
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [document.currentPage, canvasDims?.w, canvasDims?.h]);

    const getPos = (e: { clientX: number; clientY: number }) => {
      const canvas = drawCanvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const w = canvasDims?.w ?? rect.width;
      const h = canvasDims?.h ?? rect.height;
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
      if (!canvas || !ctx || !canvasDims) return;
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
      const canvas = drawCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !canvasDims) return;
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
      const canvas = drawCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !canvasDims) return;
      ctx.clearRect(0, 0, canvasDims.w, canvasDims.h);
      onSave(canvas.toDataURL('image/png'));
    }, [canvasDims, onSave]);

    useImperativeHandle(ref, () => ({ clear: clearCanvas }), [clearCanvas]);

    // Overlay canvas mirroring PDFViewer's layout so it lands exactly on the PDF canvas
    const overlay = canvasDims ? (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 5,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        padding: 24, pointerEvents: 'none',
      }}>
        <canvas
          ref={drawCanvasRef}
          style={{
            flexShrink: 0, pointerEvents: 'auto',
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            touchAction: 'none',
          }}
          onMouseDown={(e) => startDraw(getPos(e.nativeEvent))}
          onMouseMove={(e) => continueDraw(getPos(e.nativeEvent))}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={(e) => { e.preventDefault(); if (e.touches.length === 1) startDraw(getPos(e.touches[0])); }}
          onTouchMove={(e) => { e.preventDefault(); if (e.touches.length === 1) continueDraw(getPos(e.touches[0])); }}
          onTouchEnd={stopDraw}
        />
      </div>
    ) : null;

    return (
      <div style={{ flex: 1, overflow: 'auto' }}>
        <PDFViewer
          document={document}
          zoom={zoom}
          onZoomChange={onZoomChange}
          onCanvasDimensions={handleCanvasDimensions}
          overlay={overlay}
        />
      </div>
    );
  },
);

export default PDFWithDrawing;
