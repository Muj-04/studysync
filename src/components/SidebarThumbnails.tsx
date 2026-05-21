'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText, Presentation, X, FileImage } from 'lucide-react';
import type { PDFDocument, BlankPage } from '@/types';

// ── Module-level thumbnail caches ─────────────────────────────────────────────

const docPromises = new Map<string, Promise<unknown>>();
const thumbCache  = new Map<string, string>(); // "url:page" → jpeg dataURL

function getPdfDocPromise(url: string): Promise<unknown> {
  if (!docPromises.has(url)) {
    const p = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      return pdfjs.getDocument(url).promise;
    });
    docPromises.set(url, p);
  }
  return docPromises.get(url)!;
}

async function getThumb(url: string, page: number): Promise<string> {
  const key = `${url}:${page}`;
  if (thumbCache.has(key)) return thumbCache.get(key)!;

  const doc = await getPdfDocPromise(url) as any;
  const pdfPage = await doc.getPage(page);
  const vp0    = pdfPage.getViewport({ scale: 1 });
  const scale  = 152 / vp0.width;
  const vp     = pdfPage.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const dpr    = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.round(vp.width  * dpr);
  canvas.height = Math.round(vp.height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  await pdfPage.render({ canvas, viewport: vp }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  thumbCache.set(key, dataUrl);
  return dataUrl;
}

// ── PDF thumbnail (lazy via IntersectionObserver) ─────────────────────────────

function PDFThumb({ url, page }: { url: string; page: number }) {
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(`${url}:${page}`) ?? null);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = `${url}:${page}`;
    if (thumbCache.has(key)) { setSrc(thumbCache.get(key)!); return; }

    let cancelled = false;
    const el = divRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        getThumb(url, page)
          .then((s) => { if (!cancelled) setSrc(s); })
          .catch(() => {});
      },
      { threshold: 0.05, rootMargin: '120px' },
    );
    observer.observe(el);
    return () => { cancelled = true; observer.disconnect(); };
  }, [url, page]);

  return (
    <div
      ref={divRef}
      style={{
        width: '100%',
        aspectRatio: '1 / 1.294',
        background: 'var(--bg-elevated)',
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="animate-fade-in"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          className="animate-pulse"
          style={{
            position: 'absolute', inset: 0, borderRadius: 2,
            background: 'var(--bg-active)',
          }}
        />
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type VirtualPage =
  | { type: 'pdf';   pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

interface Props {
  isOpen:             boolean;
  documents:          PDFDocument[];
  activeDocumentId:   string | null;
  activeDocument:     PDFDocument | null;
  virtualPages:       VirtualPage[];
  currentVirtualIndex: number;
  onSelectDocument:   (id: string) => void;
  onRemoveDocument:   (id: string) => void;
  onNavigate:         (index: number) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SidebarThumbnails({
  isOpen, documents, activeDocumentId, activeDocument,
  virtualPages, currentVirtualIndex,
  onSelectDocument, onRemoveDocument, onNavigate,
}: Props) {
  const thumbListRef = useRef<HTMLDivElement>(null);

  // Scroll active thumbnail into view whenever the page changes
  useEffect(() => {
    const el = thumbListRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentVirtualIndex]);

  return (
    <aside
      style={{
        width: 256,       // always 256px — parent wrapper handles the width animation
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{
        width: 256,
        height: '100%',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.18s ease',
      }}>

        {/* ── Documents ── */}
        <div style={{ padding: '10px 10px 5px', flexShrink: 0 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}>
            Documents
          </span>
        </div>

        <div style={{
          padding: '0 5px 4px',
          flexShrink: 0,
          maxHeight: 120,
          overflowY: 'auto',
        }}>
          {documents.map((doc) => {
            const active = doc.id === activeDocumentId;
            return (
              <button
                key={doc.id}
                onClick={() => onSelectDocument(doc.id)}
                className="group"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 6px', borderRadius: 5, marginBottom: 1,
                  background: active ? 'var(--bg-active)' : 'transparent',
                  border: '1px solid transparent',
                  color: active ? 'var(--text-1)' : 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseOver={(e) => {
                  if (!active) Object.assign(e.currentTarget.style, {
                    background: 'var(--bg-hover)', color: 'var(--text-1)',
                  });
                }}
                onMouseOut={(e) => {
                  if (!active) Object.assign(e.currentTarget.style, {
                    background: 'transparent',
                    color: 'var(--text-2)',
                  });
                }}
              >
                {doc.type === 'pptx'
                  ? <Presentation size={11} style={{ flexShrink: 0, color: active ? 'var(--accent-hover)' : 'var(--text-3)' }} />
                  : <FileText     size={11} style={{ flexShrink: 0, color: active ? 'var(--accent-hover)' : 'var(--text-3)' }} />}
                <span style={{
                  flex: 1, fontSize: 11,
                  fontWeight: active ? 500 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', lineHeight: 1.3,
                }}>
                  {doc.name}
                </span>
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveDocument(doc.id); }}
                  className="opacity-0 group-hover:opacity-100"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 15, height: 15, borderRadius: 3,
                    color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0,
                    transition: 'opacity 0.12s, color 0.12s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--red)' })}
                  onMouseOut={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-3)' })}
                >
                  <X size={9} />
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />

        {/* ── Pages ── */}
        <div style={{ padding: '6px 10px 3px', flexShrink: 0 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}>
            Pages
          </span>
        </div>

        <div
          ref={thumbListRef}
          style={{ flex: 1, overflowY: 'auto', padding: '3px 6px 10px' }}
        >
          {activeDocument
            ? virtualPages.map((vp, idx) => {
                const isActive = idx === currentVirtualIndex;
                const key = vp.type === 'pdf'
                  ? `pdf-${vp.pdfPage}`
                  : `blank-${vp.blankPage.id}`;
                const label = vp.type === 'pdf'
                  ? `Page ${vp.pdfPage}`
                  : 'Blank';

                return (
                  <button
                    key={key}
                    data-active={isActive ? 'true' : undefined}
                    onClick={() => onNavigate(idx)}
                    style={{
                      width: '100%',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 4, padding: '4px 3px',
                      borderRadius: 6, marginBottom: 2,
                      border: `1px solid ${isActive ? 'rgba(89,101,217,.45)' : 'transparent'}`,
                      background: isActive ? 'var(--accent-muted)' : 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                    onMouseOver={(e) => {
                      if (!isActive) Object.assign(e.currentTarget.style, {
                        background: 'var(--bg-hover)', borderColor: 'var(--border)',
                      });
                    }}
                    onMouseOut={(e) => {
                      if (!isActive) Object.assign(e.currentTarget.style, {
                        background: 'transparent', borderColor: 'transparent',
                      });
                    }}
                  >
                    {/* Thumbnail image */}
                    <div style={{ width: '100%', position: 'relative' }}>
                      {vp.type === 'pdf' ? (
                        activeDocument.type === 'pptx' && activeDocument.slides?.[vp.pdfPage - 1] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={activeDocument.slides[vp.pdfPage - 1]}
                            alt={`Slide ${vp.pdfPage}`}
                            draggable={false}
                            style={{ width: '100%', borderRadius: 2, display: 'block' }}
                          />
                        ) : (
                          <PDFThumb url={activeDocument.url} page={vp.pdfPage} />
                        )
                      ) : (
                        <div style={{
                          width: '100%', aspectRatio: '1 / 1.294',
                          background: '#ffffff',
                          border: '1px solid var(--border)',
                          borderRadius: 2,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <FileImage size={14} style={{ color: 'var(--border-strong)' }} />
                        </div>
                      )}

                      {/* Active border overlay */}
                      {isActive && (
                        <div style={{
                          position: 'absolute', inset: -1,
                          borderRadius: 3,
                          border: '2px solid var(--accent)',
                          pointerEvents: 'none',
                        }} />
                      )}
                    </div>

                    {/* Page label */}
                    <span style={{
                      fontSize: 9.5,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--accent-hover)' : 'var(--text-3)',
                      letterSpacing: '0.02em',
                      lineHeight: 1,
                    }}>
                      {label}
                    </span>
                  </button>
                );
              })
            : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 64,
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No document</span>
              </div>
            )}
        </div>
      </div>
    </aside>
  );
}
