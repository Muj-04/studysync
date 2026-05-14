'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PDFDocument } from '@/types';

let pdfjsCache: typeof import('pdfjs-dist') | null = null;

async function getPDFJS() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  pdfjsCache = pdfjs;
  return pdfjs;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.0;

export function clampZoom(z: number) {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
}

interface Props {
  document: PDFDocument;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onCanvasDimensions?: (cssW: number, cssH: number) => void;
  overlay?: React.ReactNode;
}

export default function PDFViewer({ document, zoom = 1, onZoomChange, onCanvasDimensions, overlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pdfUrlRef = useRef<string>('');
  const renderTaskRef = useRef<RenderTask | null>(null);
  const onDimsRef = useRef(onCanvasDimensions);
  const onZoomChangeRef = useRef(onZoomChange);
  // Tracks live zoom ahead of React state for fast gesture sequences
  const liveZoomRef = useRef(zoom);
  const lastPinchDistRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep refs in sync every render
  useEffect(() => { onDimsRef.current = onCanvasDimensions; });
  useEffect(() => { onZoomChangeRef.current = onZoomChange; });
  useEffect(() => { liveZoomRef.current = zoom; });
  useEffect(() => { return () => { pdfRef.current?.destroy(); }; }, []);

  // PDF render effect — re-runs on page, url, or zoom change
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function render(cv: HTMLCanvasElement, ct: HTMLDivElement) {
      try {
        const pdfjs = await getPDFJS();

        if (pdfUrlRef.current !== document.url) {
          if (pdfRef.current) { await pdfRef.current.destroy(); pdfRef.current = null; }
          const loaded = await pdfjs.getDocument(document.url).promise;
          if (cancelled) { await loaded.destroy(); return; }
          pdfRef.current = loaded;
          pdfUrlRef.current = document.url;
        }

        if (!pdfRef.current || cancelled) return;

        const page = await pdfRef.current.getPage(document.currentPage);
        if (cancelled) return;

        renderTaskRef.current?.cancel();

        const dpr = window.devicePixelRatio || 1;
        const containerWidth = ct.clientWidth - 48;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = (containerWidth / baseViewport.width) * zoom * dpr;
        const viewport = page.getViewport({ scale });

        cv.width = viewport.width;
        cv.height = viewport.height;
        cv.style.width = `${viewport.width / dpr}px`;
        cv.style.height = `${viewport.height / dpr}px`;

        renderTaskRef.current = page.render({ canvas: cv, viewport });
        await renderTaskRef.current.promise;

        if (!cancelled) {
          setIsLoading(false);
          onDimsRef.current?.(viewport.width / dpr, viewport.height / dpr);
        }
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name === 'RenderingCancelledException') return;
        setError('Failed to render this page.');
        setIsLoading(false);
      }
    }

    render(canvas, container);
    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
  }, [document.url, document.currentPage, zoom]);

  // Ctrl+scroll / Cmd+scroll zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const next = clampZoom(liveZoomRef.current + delta);
      liveZoomRef.current = next;
      onZoomChangeRef.current?.(next);
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Pinch-to-zoom (two-finger trackpad / touchscreen)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDistRef.current = Math.hypot(dx, dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastPinchDistRef.current === null) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / lastPinchDistRef.current;
      lastPinchDistRef.current = dist;
      const next = clampZoom(liveZoomRef.current * ratio);
      liveZoomRef.current = next;
      onZoomChangeRef.current?.(next);
    };

    const handleTouchEnd = () => { lastPinchDistRef.current = null; };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex justify-center items-start min-h-full p-6"
      style={{ minWidth: 'max-content' }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-9 h-9 rounded-full"
              style={{
                border: '2.5px solid rgba(255,255,255,0.15)',
                borderTopColor: 'rgba(255,255,255,0.7)',
                animation: 'spin 0.75s linear infinite',
              }}
            />
            <span className="text-xs font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Rendering…
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div
            className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>{error}</p>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`rounded-sm ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        style={{
          boxShadow: '0 12px 48px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3)',
          transition: 'opacity 0.25s ease',
        }}
      />
      {overlay}
    </div>
  );
}
