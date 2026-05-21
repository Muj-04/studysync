'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist';
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

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  document: PDFDocument;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onCanvasDimensions?: (cssW: number, cssH: number) => void;
  overlay?: React.ReactNode;
  /** Called after each successful page render with the page object and CSS-scale viewport. */
  onPageReady?: (page: PDFPageProxy, cssViewport: PageViewport) => void;
  /** Highlight rectangles to render over the PDF (in CSS pixels, relative to canvas top-left). */
  searchHighlights?: HighlightRect[];
  /** Index of the currently active highlight (orange vs yellow). */
  searchActiveIndex?: number;
}

export default function PDFViewer({
  document, zoom = 1, onZoomChange, onCanvasDimensions, overlay,
  onPageReady, searchHighlights, searchActiveIndex,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const pdfRef      = useRef<PDFDocumentProxy | null>(null);
  const pdfUrlRef   = useRef<string>('');
  const renderTaskRef = useRef<RenderTask | null>(null);
  const onDimsRef       = useRef(onCanvasDimensions);
  const onZoomChangeRef = useRef(onZoomChange);
  const onPageReadyRef  = useRef(onPageReady);
  const liveZoomRef     = useRef(zoom);
  const lastPinchDistRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // CSS canvas dimensions — used to size the wrapper div for highlight positioning
  const [cssDims, setCssDims] = useState<{ w: number; h: number } | null>(null);
  // Ref map for scrolling active highlight into view
  const highlightRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => { onDimsRef.current      = onCanvasDimensions; });
  useEffect(() => { onZoomChangeRef.current = onZoomChange; });
  useEffect(() => { onPageReadyRef.current  = onPageReady; });
  useEffect(() => { liveZoomRef.current     = zoom; });
  useEffect(() => { return () => { pdfRef.current?.destroy(); }; }, []);

  // Scroll active highlight into view when it changes
  useEffect(() => {
    if (searchActiveIndex == null) return;
    const el = highlightRefs.current.get(searchActiveIndex);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [searchActiveIndex]);

  // PDF render — re-runs on page, url, or zoom change
  useEffect(() => {
    const canvas   = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvas || !scrollEl) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function render() {
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

        const dpr        = window.devicePixelRatio || 1;
        const panelWidth = (scrollRef.current?.clientWidth ?? 400) - 48;
        const baseVp     = page.getViewport({ scale: 1 });
        // CSS-scale viewport — used for search coordinate mapping
        const cssScale   = (panelWidth / baseVp.width) * zoom;
        const cssVp      = page.getViewport({ scale: cssScale });
        // High-DPR viewport — used for canvas rendering
        const viewport   = page.getViewport({ scale: cssScale * dpr });

        canvas!.width        = viewport.width;
        canvas!.height       = viewport.height;
        canvas!.style.width  = `${cssVp.width}px`;
        canvas!.style.height = `${cssVp.height}px`;

        renderTaskRef.current = page.render({ canvas: canvas!, viewport });
        await renderTaskRef.current.promise;

        if (!cancelled) {
          setIsLoading(false);
          setCssDims({ w: cssVp.width, h: cssVp.height });
          onDimsRef.current?.(cssVp.width, cssVp.height);
          onPageReadyRef.current?.(page, cssVp);
        }
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name === 'RenderingCancelledException') return;
        setError('Failed to render this page.');
        setIsLoading(false);
      }
    }

    render();
    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
  }, [document.url, document.currentPage, zoom]);

  // Ctrl / Cmd + scroll zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const next  = clampZoom(liveZoomRef.current + delta);
      liveZoomRef.current = next;
      onZoomChangeRef.current?.(next);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Pinch-to-zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastPinchDistRef.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastPinchDistRef.current === null) return;
      e.preventDefault();
      const dist  = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const ratio = dist / lastPinchDistRef.current;
      lastPinchDistRef.current = dist;
      const next  = clampZoom(liveZoomRef.current * ratio);
      liveZoomRef.current = next;
      onZoomChangeRef.current?.(next);
    };
    const onTouchEnd = () => { lastPinchDistRef.current = null; };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}
    >
      <div
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          padding: 24,
          minWidth: '100%', width: 'max-content', boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {isLoading && (
          <div
            className="animate-fade-in"
            style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
              padding: 24, pointerEvents: 'none',
            }}
          >
            <div style={{
              ...(cssDims
                ? { width: cssDims.w, height: cssDims.h }
                : { width: '100%', maxWidth: 560, aspectRatio: '0.707 / 1' }),
              flexShrink: 0,
              background: 'var(--bg-panel)',
              borderRadius: 3,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
              padding: '9% 12%',
              display: 'flex', flexDirection: 'column', gap: 11,
              overflow: 'hidden', boxSizing: 'border-box',
            }}>
              <div className="skeleton" style={{ height: 17, width: '52%', marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 10, width: '100%' }} />
              <div className="skeleton" style={{ height: 10, width: '97%' }} />
              <div className="skeleton" style={{ height: 10, width: '89%' }} />
              <div className="skeleton" style={{ height: 10, width: '94%' }} />
              <div style={{ height: 6, flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 10, width: '100%' }} />
              <div className="skeleton" style={{ height: 10, width: '93%' }} />
              <div className="skeleton" style={{ height: 10, width: '98%' }} />
              <div className="skeleton" style={{ height: 10, width: '82%' }} />
              <div style={{ height: 6, flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 10, width: '100%' }} />
              <div className="skeleton" style={{ height: 10, width: '96%' }} />
              <div className="skeleton" style={{ height: 10, width: '75%' }} />
              <div style={{ height: 6, flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 10, width: '100%' }} />
              <div className="skeleton" style={{ height: 10, width: '88%' }} />
              <div className="skeleton" style={{ height: 10, width: '70%' }} />
            </div>
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 8,
              background: 'var(--red-muted)',
              border: '1px solid rgba(229,72,77,.25)',
            }}>
              <p style={{ fontSize: 12.5, color: 'var(--red)', fontWeight: 500 }}>{error}</p>
            </div>
          </div>
        )}

        {/* Canvas wrapper — gives a positioning context for highlight rects */}
        <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              borderRadius: 3,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
              opacity: isLoading ? 0 : 1,
              transition: 'opacity 0.25s ease',
            }}
          />

          {/* Search highlights */}
          {cssDims && searchHighlights && searchHighlights.length > 0 && searchHighlights.map((h, i) => {
            const isActive = i === searchActiveIndex;
            return (
              <div
                key={i}
                ref={(el) => {
                  if (el) highlightRefs.current.set(i, el);
                  else highlightRefs.current.delete(i);
                }}
                style={{
                  position: 'absolute',
                  left: h.x, top: h.y,
                  width: h.w, height: h.h,
                  background: isActive
                    ? 'rgba(255, 110, 20, 0.55)'
                    : 'rgba(255, 210, 0, 0.38)',
                  borderRadius: 2,
                  outline: isActive ? '1.5px solid rgba(255,110,20,0.7)' : 'none',
                  pointerEvents: 'none',
                  zIndex: 4,
                  mixBlendMode: 'multiply',
                }}
              />
            );
          })}
        </div>

        {overlay}
      </div>
    </div>
  );
}
