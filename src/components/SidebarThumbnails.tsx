'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText, Presentation, X, FileImage, Bookmark, ChevronRight, Loader2, GripVertical, MoreHorizontal, Trash2 } from 'lucide-react';
import {
  DndContext, closestCenter, DragOverlay,
  MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PDFDocument, BlankPage, Bookmark as BookmarkType } from '@/types';

// ── Module-level thumbnail caches ─────────────────────────────────────────────

const docPromises = new Map<string, Promise<unknown>>();
const thumbCache  = new Map<string, string>(); // "url:page" → jpeg dataURL
const outlineCache = new Map<string, OutlineItem[]>(); // url → resolved outline

// Notes (text + voice) used to live in this sidebar's "Notes" tab; that
// tab was removed in the right-panel restructure. Notes are now rendered
// by NotesTabContent in the right panel. The combinedNotes builder, the
// annotations tab JSX, and the NoteEntry type were deleted from this
// file. SidebarThumbnails now has just two tabs: Pages and Outlines.

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

// ── Outline types + loader ────────────────────────────────────────────────────

interface OutlineItem {
  title: string;
  page: number | null;
  bold?: boolean;
  italic?: boolean;
  items: OutlineItem[];
}

async function resolveDestToPage(doc: any, dest: string | any[] | null): Promise<number | null> {
  if (!dest) return null;
  try {
    const d: any[] | null = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!d || !d[0]) return null;
    const idx = await doc.getPageIndex(d[0]);
    return idx + 1;
  } catch {
    return null;
  }
}

async function resolveOutlineItems(doc: any, rawItems: any[]): Promise<OutlineItem[]> {
  return Promise.all(
    rawItems.map(async (item) => ({
      title: item.title || '(untitled)',
      bold: item.bold,
      italic: item.italic,
      page: await resolveDestToPage(doc, item.dest),
      items: item.items?.length > 0 ? await resolveOutlineItems(doc, item.items) : [],
    })),
  );
}

async function loadOutlineForUrl(url: string): Promise<OutlineItem[]> {
  if (outlineCache.has(url)) return outlineCache.get(url)!;
  const doc = await getPdfDocPromise(url) as any;
  const raw = await doc.getOutline();
  if (!raw) { outlineCache.set(url, []); return []; }
  const items = await resolveOutlineItems(doc, raw);
  outlineCache.set(url, items);
  return items;
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

// ── Outline tree node ─────────────────────────────────────────────────────────

function OutlineNode({
  item, depth, onNavigate,
}: {
  item: OutlineItem;
  depth: number;
  onNavigate: (page: number) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = item.items.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (item.page != null) onNavigate(item.page);
          if (hasChildren) setExpanded((e) => !e);
        }}
        title={item.page != null ? `Go to page ${item.page}` : item.title}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 4,
          padding: `5px 8px 5px ${depth * 12 + 6}px`,
          background: 'transparent', border: 'none',
          color: 'var(--text-2)', cursor: item.page != null ? 'pointer' : 'default',
          fontFamily: 'inherit', textAlign: 'left',
          borderRadius: 4,
          transition: 'background 0.1s, color 0.1s',
        }}
        onMouseOver={(e) => {
          if (item.page != null) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' });
        }}
        onMouseOut={(e) => {
          Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' });
        }}
      >
        {hasChildren ? (
          <span style={{ flexShrink: 0, transition: 'transform 0.15s', display: 'flex', transform: expanded ? 'rotate(90deg)' : 'none' }}>
            <ChevronRight size={9} strokeWidth={2.5} style={{ color: 'var(--text-3)' }} />
          </span>
        ) : (
          <span style={{ width: 9, flexShrink: 0 }} />
        )}
        <span style={{
          flex: 1, fontSize: 11.5, lineHeight: 1.4,
          fontWeight: item.bold ? 600 : 400,
          fontStyle: item.italic ? 'italic' : 'normal',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </span>
        {item.page != null && (
          <span style={{
            fontSize: 10, color: 'var(--text-3)',
            flexShrink: 0, fontVariantNumeric: 'tabular-nums',
          }}>
            {item.page}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {item.items.map((child, i) => (
            <OutlineNode key={i} item={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sortable document row ─────────────────────────────────────────────────────

function SortableDocRow({
  doc, isActive, onSelect, onRemove,
}: {
  doc: PDFDocument; isActive: boolean;
  onSelect: (id: string) => void; onRemove: (id: string) => void;
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: doc.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0 : 1,
      }}
    >
      <DocRowContent
        doc={doc} isActive={isActive}
        onSelect={onSelect} onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// ── Shared row visual (used by both sortable item and drag overlay) ────────────

function DocRowContent({
  doc, isActive, onSelect, onRemove, dragHandleProps,
}: {
  doc: PDFDocument; isActive: boolean;
  onSelect: (id: string) => void; onRemove: (id: string) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      className="group"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 6px 3px 3px', borderRadius: 4, marginBottom: 1,
        background: isActive ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--border-strong)' : 'transparent'}`,
        color: isActive ? 'var(--text-1)' : 'var(--text-2)',
        transition: 'background 0.12s, color 0.12s',
        cursor: 'default',
        userSelect: 'none',
      }}
      onMouseOver={(e) => {
        if (!isActive) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' });
      }}
      onMouseOut={(e) => {
        if (!isActive) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' });
      }}
    >
      {/* Drag handle */}
      <span
        {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
        title="Drag to reorder"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 18, flexShrink: 0,
          color: 'var(--text-3)', cursor: 'grab',
          touchAction: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={9} />
      </span>

      {/* File icon */}
      {doc.type === 'pptx'
        ? <Presentation size={10} style={{ flexShrink: 0, color: isActive ? 'var(--text-1)' : 'var(--text-3)' }} />
        : <FileText     size={10} style={{ flexShrink: 0, color: isActive ? 'var(--text-1)' : 'var(--text-3)' }} />}

      {/* Name — clickable */}
      <button
        onClick={() => onSelect(doc.id)}
        style={{
          flex: 1, background: 'none', border: 'none', padding: 0,
          fontSize: 11, fontWeight: isActive ? 500 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', lineHeight: 1.3,
          color: 'inherit', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        {doc.name}
      </button>

      {/* Remove */}
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); onRemove(doc.id); }}
        className="opacity-0 group-hover:opacity-100"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 15, height: 15, borderRadius: 3,
          color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0,
          transition: 'opacity 0.12s, color 0.12s',
        }}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--red)' })}
        onMouseOut={(e)  => Object.assign(e.currentTarget.style, { color: 'var(--text-3)' })}
      >
        <X size={9} />
      </span>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type VirtualPage =
  | { type: 'pdf';   pdfPage: number }
  | { type: 'blank'; blankPage: BlankPage };

interface Props {
  isOpen:              boolean;
  documents:           PDFDocument[];
  activeDocumentId:    string | null;
  activeDocument:      PDFDocument | null;
  virtualPages:        VirtualPage[];
  currentVirtualIndex: number;
  onSelectDocument:    (id: string) => void;
  onRemoveDocument:    (id: string) => void;
  onNavigate:          (index: number) => void;
  bookmarks?:           BookmarkType[];
  onRemoveBookmark?:    (id: string) => void;
  onNavigateToPdfPage?: (page: number) => void;
  isPPTX?:              boolean;
  onReorderDocuments?:  (ids: string[]) => void;
  onDeleteBlankPage?:   (id: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

const SIDEBAR_TABS = [
  { id: 'pages',    label: 'Pages' },
  { id: 'outlines', label: 'Outlines' },
] as const;

type SidebarTab = typeof SIDEBAR_TABS[number]['id'];

export default function SidebarThumbnails({
  isOpen, documents, activeDocumentId, activeDocument,
  virtualPages, currentVirtualIndex,
  onSelectDocument, onRemoveDocument, onNavigate,
  bookmarks = [], onRemoveBookmark, onNavigateToPdfPage,
  isPPTX = false,
  onReorderDocuments,
  onDeleteBlankPage,
}: Props) {
  const thumbListRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('pages');
  const [openBlankMenuId, setOpenBlankMenuId] = useState<string | null>(null);

  // Close kebab menu on outside-click / Escape
  useEffect(() => {
    if (!openBlankMenuId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest?.('[data-blank-menu]') && !target.closest?.('[data-blank-menu-trigger]')) {
        setOpenBlankMenuId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenBlankMenuId(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openBlankMenuId]);

  // ── DnD (hooks must be unconditional) ─────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = documents.findIndex((d) => d.id === active.id);
    const newIndex = documents.findIndex((d) => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderDocuments?.(arrayMove(documents.map((d) => d.id), oldIndex, newIndex));
  };

  const draggingDoc = draggingId ? documents.find((d) => d.id === draggingId) : null;

  // Outline state
  const [outlineItems, setOutlineItems] = useState<OutlineItem[] | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState('');

  // Scroll active thumbnail into view whenever the page changes
  useEffect(() => {
    const el = thumbListRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentVirtualIndex]);

  // Load outline when tab becomes active or document changes
  useEffect(() => {
    if (activeTab !== 'outlines') return;
    if (!activeDocument || isPPTX) { setOutlineItems(null); return; }

    setOutlineLoading(true);
    setOutlineItems(null);
    setOutlineError('');

    loadOutlineForUrl(activeDocument.url)
      .then((items) => { setOutlineItems(items); setOutlineLoading(false); })
      .catch((e) => { setOutlineError((e as Error).message.slice(0, 120)); setOutlineLoading(false); });
  }, [activeTab, activeDocument, isPPTX]);

  return (
    <aside
      style={{
        width: '100%',
        flexShrink: 0,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg-sidebar)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.18s ease',
      }}>

        {/* ── Tab navigation ── */}
        <div style={{
          padding: '8px 8px 0',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {SIDEBAR_TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  flex: 1,
                  padding: '6px 4px 8px',
                  fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: activeTab === id ? '#ffffff' : 'var(--text-3)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === id ? 'rgba(255,255,255,0.7)' : 'transparent'}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'color 0.13s, border-color 0.13s',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                }}
                onMouseOver={(e) => {
                  if (activeTab !== id) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                }}
                onMouseOut={(e) => {
                  if (activeTab !== id) (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                }}
              >
                {label}
                {id === 'pages' && bookmarks.length > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: 2,
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#f59e0b',
                  }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ══ OUTLINES tab ══ */}
        {activeTab === 'outlines' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px 10px' }}>
            {!activeDocument && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 8, padding: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>Open a PDF document to view its outline.</p>
              </div>
            )}
            {activeDocument && isPPTX && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 8, padding: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>Outline not available for PPTX files.</p>
              </div>
            )}
            {activeDocument && !isPPTX && outlineLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, gap: 8 }}>
                <Loader2 size={14} className="spinner" style={{ color: 'var(--text-3)' }} />
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Loading outline…</span>
              </div>
            )}
            {activeDocument && !isPPTX && !outlineLoading && outlineError && (
              <div style={{ padding: '12px 14px' }}>
                <p style={{ fontSize: 11.5, color: 'var(--red)', lineHeight: 1.5 }}>{outlineError}</p>
              </div>
            )}
            {activeDocument && !isPPTX && !outlineLoading && !outlineError && outlineItems !== null && (
              outlineItems.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 6, padding: 20 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', textAlign: 'center' }}>No outline available</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>This PDF has no table of contents.</p>
                </div>
              ) : (
                <div style={{ padding: '4px 0' }}>
                  {outlineItems.map((item, i) => (
                    <OutlineNode
                      key={i}
                      item={item}
                      depth={0}
                      onNavigate={onNavigateToPdfPage ?? (() => {})}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* The "Notes" tab was removed from this sidebar; notes (text +
            voice) are now rendered by NotesTabContent in the right panel
            as sticky-note cards. */}

        {/* ══ PAGES tab ══ */}
        {activeTab === 'pages' && (
          <>
            {/* ── Documents ── */}
            <div style={{ padding: '8px 10px 4px', flexShrink: 0 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-3)',
              }}>
                Documents
              </span>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={documents.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div style={{ padding: '0 5px 4px', flexShrink: 0, maxHeight: 120, overflowY: 'auto' }}>
                  {documents.map((doc) => (
                    <SortableDocRow
                      key={doc.id}
                      doc={doc}
                      isActive={doc.id === activeDocumentId}
                      onSelect={onSelectDocument}
                      onRemove={onRemoveDocument}
                    />
                  ))}
                </div>
              </SortableContext>

              {/* Floating drag preview */}
              <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
                {draggingDoc && (
                  <div style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 4,
                                        padding: '0 6px 0 3px',
                    opacity: 0.96,
                  }}>
                    <DocRowContent
                      doc={draggingDoc}
                      isActive={draggingDoc.id === activeDocumentId}
                      onSelect={() => {}}
                      onRemove={() => {}}
                    />
                  </div>
                )}
              </DragOverlay>
            </DndContext>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />

            {/* ── Bookmarks section ── */}
            {bookmarks.length > 0 && (
              <>
                <div style={{ padding: '6px 10px 3px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Bookmark size={9} fill="#f59e0b" style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <span style={{
                    fontSize: 9.5, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--text-3)',
                  }}>
                    Bookmarks
                  </span>
                </div>
                <div style={{ padding: '0 5px 4px', flexShrink: 0, maxHeight: 130, overflowY: 'auto' }}>
                  {bookmarks.map((bm) => (
                    <button
                      key={bm.id}
                      onClick={() => onNavigate(bm.virtualIndex)}
                      className="group"
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', borderRadius: 4, marginBottom: 1,
                        background: bm.virtualIndex === currentVirtualIndex ? 'rgba(251,191,36,0.1)' : 'transparent',
                        border: `1px solid ${bm.virtualIndex === currentVirtualIndex ? 'rgba(251,191,36,0.3)' : 'transparent'}`,
                        color: 'var(--text-2)',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        transition: 'background 0.12s',
                      }}
                      onMouseOver={(e) => {
                        if (bm.virtualIndex !== currentVirtualIndex) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' });
                      }}
                      onMouseOut={(e) => {
                        if (bm.virtualIndex !== currentVirtualIndex) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' });
                      }}
                    >
                      <Bookmark size={10} fill="#f59e0b" style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                        {bm.label}
                      </span>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); onRemoveBookmark?.(bm.id); }}
                        className="opacity-0 group-hover:opacity-100"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 14, height: 14, borderRadius: 3,
                          color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0,
                          transition: 'opacity 0.12s, color 0.12s',
                        }}
                        onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--red)' })}
                        onMouseOut={(e) => Object.assign(e.currentTarget.style, { color: 'var(--text-3)' })}
                      >
                        <X size={9} />
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />
              </>
            )}

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
                    const isBookmarked = bookmarks.some((b) => b.virtualIndex === idx);
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
                        className="group"
                        style={{
                          width: '100%',
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          gap: 4, padding: '4px 3px',
                          borderRadius: 4, marginBottom: 2,
                          border: `1px solid ${isActive ? 'rgba(255,255,255,0.35)' : 'transparent'}`,
                          background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'background 0.12s, border-color 0.12s',
                          position: 'relative',
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
                        {/* Bookmark indicator */}
                        {isBookmarked && (
                          <div style={{
                            position: 'absolute', top: 5, right: 5, zIndex: 1,
                          }}>
                            <Bookmark size={9} fill="#f59e0b" style={{ color: '#f59e0b' }} />
                          </div>
                        )}

                        {/* Blank-page kebab menu (hover-revealed) */}
                        {vp.type === 'blank' && onDeleteBlankPage && (
                          <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 2 }}>
                            <span
                              role="button"
                              tabIndex={0}
                              data-blank-menu-trigger
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenBlankMenuId(openBlankMenuId === vp.blankPage.id ? null : vp.blankPage.id);
                              }}
                              className={openBlankMenuId === vp.blankPage.id ? '' : 'opacity-0 group-hover:opacity-100'}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 18, height: 18, borderRadius: 4,
                                background: 'var(--bg-float)', border: '1px solid var(--bg-float-border)',
                                color: 'var(--text-2)', cursor: 'pointer',
                                opacity: openBlankMenuId === vp.blankPage.id ? 1 : 0,
                                transition: 'opacity 0.12s, color 0.12s',
                              }}
                              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                              onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
                            >
                              <MoreHorizontal size={11} />
                            </span>
                            {openBlankMenuId === vp.blankPage.id && (
                              <div
                                data-blank-menu
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  position: 'absolute', top: '100%', left: 0, marginTop: 4,
                                  minWidth: 150,
                                  background: 'var(--bg-float)',
                                  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                                  border: '1px solid var(--bg-float-border)',
                                  boxShadow: 'var(--shadow-float)',
                                  borderRadius: 6, padding: 4,
                                  zIndex: 100,
                                }}
                              >
                                <button
                                  onClick={() => {
                                    onDeleteBlankPage(vp.blankPage.id);
                                    setOpenBlankMenuId(null);
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    width: '100%', height: 28, padding: '0 10px',
                                    borderRadius: 4,
                                    background: 'transparent', border: 'none',
                                    color: 'var(--red)', cursor: 'pointer',
                                    fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                                    textAlign: 'left',
                                    transition: 'background 0.12s',
                                  }}
                                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--red-muted)'; }}
                                  onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                  <Trash2 size={12} />
                                  Delete blank page
                                </button>
                              </div>
                            )}
                          </div>
                        )}

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
          </>
        )}
      </div>
    </aside>
  );
}
