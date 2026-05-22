'use client';
import { useEffect, useRef, useState, useCallback, memo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFDocument, VoiceNote, BlankPage } from '@/types';
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

// ── Document cache (shared across page renders) ───────────────────────────────

const docCache = new Map<string, Promise<PDFDocumentProxy>>();
async function getDocProxy(url: string): Promise<PDFDocumentProxy> {
  if (!docCache.has(url)) {
    const pdfjs = await getPDFJS();
    docCache.set(url, pdfjs.getDocument(url).promise);
  }
  return docCache.get(url)!;
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

// ── Single page item (lazy render) ────────────────────────────────────────────

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
}

const ScrollPageItem = memo(function ScrollPageItem({
  vp, document, containerWidth, zoom, notes,
  isRecordingHere, onRecordStart, onRecordStop,
  pageRefsMap, index,
}: PageItemProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [canvasH, setCanvasH] = useState<number | null>(null);
  const renderKeyRef = useRef(0);

  // Register this element in the parent's scroll-tracking map
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    pageRefsMap.set(index, el);
    return () => { pageRefsMap.delete(index); };
  }, [index, pageRefsMap]);

  // Only load/render once visible (+ generous pre-load margin)
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: '600px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Render the PDF page onto the canvas
  useEffect(() => {
    if (!visible || vp.type !== 'pdf') return;
    const canvas = canvasRef.current;
    if (!canvas || containerWidth < 10) return;
    const key = ++renderKeyRef.current;

    (async () => {
      try {
        const doc = await getDocProxy(document.url);
        if (key !== renderKeyRef.current) return;
        const page = await doc.getPage(vp.pdfPage);
        if (key !== renderKeyRef.current) return;

        const naturalVP = page.getViewport({ scale: 1 });
        const scale = (containerWidth * zoom) / naturalVP.width;
        const vport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.round(vport.width * dpr);
        canvas.height = Math.round(vport.height * dpr);
        canvas.style.width = `${vport.width}px`;
        canvas.style.height = `${vport.height}px`;

        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: ctx, viewport: vport, canvas }).promise;
        if (key !== renderKeyRef.current) return;
        setCanvasH(vport.height);
      } catch { /* cancelled or PDF error */ }
    })();
  }, [visible, vp, document.url, containerWidth, zoom]);

  const pageW = containerWidth * zoom;
  const pageH = canvasH ?? pageW * 1.414; // A4 aspect ratio as placeholder
  const shadow = '0 2px 16px rgba(0,0,0,0.45)';

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
      {visible && !canvasH && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.9)',
        }}>
          <div style={{
            width: 18, height: 18,
            border: '2px solid #ddd', borderTopColor: '#666',
            borderRadius: '50%', animation: 'spin 0.7s linear infinite',
          }} />
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'block' }} />
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
}

export default function PDFScrollViewer({
  document, virtualPages, currentVirtualIndex, onPageChange,
  zoom, getNotesForPage, isRecording, recordingContext,
  onRecordStart, onRecordStop,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const [containerWidth, setContainerWidth] = useState(600);
  const programmaticRef = useRef(false);
  const lastUserScrollRef = useRef(0);
  const mountedRef = useRef(false);
  const initialIndexRef = useRef(currentVirtualIndex);

  // Measure container width for page sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(Math.floor(el.getBoundingClientRect().width));
    const obs = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // On mount: jump to the current page (no animation, just position)
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

  // External index change (nav buttons / thumbnail click) → smooth scroll to page
  useEffect(() => {
    if (!mountedRef.current) return;
    // Skip if this index change came from the user scrolling
    if (Date.now() - lastUserScrollRef.current < 400) return;
    const el = pageRefsMap.current.get(currentVirtualIndex);
    if (!el || !containerRef.current) return;
    programmaticRef.current = true;
    containerRef.current.scrollTo({ top: Math.max(0, el.offsetTop - 24), behavior: 'smooth' });
    const t = setTimeout(() => { programmaticRef.current = false; }, 900);
    return () => clearTimeout(t);
  }, [currentVirtualIndex]);

  // User scroll → find nearest page → update index in parent
  const onScroll = useCallback(() => {
    if (programmaticRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    lastUserScrollRef.current = Date.now();

    const viewMid = container.scrollTop + container.clientHeight / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    pageRefsMap.current.forEach((el, idx) => {
      const elMid = el.offsetTop + el.offsetHeight / 2;
      const dist = Math.abs(elMid - viewMid);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    onPageChange(bestIdx);
  }, [onPageChange]);

  // Usable width = container minus horizontal padding (24px each side)
  const usableWidth = Math.max(containerWidth - 48, 100);

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

        return (
          <ScrollPageItem
            key={vp.type === 'pdf' ? `pdf-${vp.pdfPage}` : `blank-${vp.blankPage.id}`}
            vp={vp}
            document={document}
            containerWidth={usableWidth}
            zoom={zoom}
            notes={notes}
            isRecordingHere={isRecordingHere}
            onRecordStart={() => onRecordStart(document.id, pageId)}
            onRecordStop={onRecordStop}
            pageRefsMap={pageRefsMap.current}
            index={idx}
          />
        );
      })}
      <div style={{ height: 48, flexShrink: 0 }} />
    </div>
  );
}
