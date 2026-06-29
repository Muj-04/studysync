'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  FileText, Search, Trash2, Upload, X, Star, Tag, Clock,
  Plus, ArrowUpDown, Filter, ChevronDown, BookOpen,
  Grid3X3, List, MoreHorizontal,
} from 'lucide-react';
import {
  fetchLibraryDocuments, deleteLibraryDocument,
  getDocumentTagsMap, getAllUserTags, addDocumentTag, removeDocumentTag,
  getFavoriteDocIds, toggleFavorite, getStudyTimeMap,
} from '@/lib/supabase/db';
import type { LibraryDocument } from '@/lib/supabase/db';
import { setPendingReopenFile } from '@/lib/pendingReopenFile';
import { useAuthGuard } from '@/hooks/useAuthGuard';

/**
 * Library page — Figma-matched redesign.
 *
 * Layout:
 *   Header row:  "My Library" h1 · grid/list view toggle · Upload Document
 *   Filter row:  search input · sort dropdown · tag-filter button
 *   Content:     responsive grid OR list view of doc cards
 *
 * Shared (app)/layout already provides LeftRail + identity surface, so
 * this page drops the inline header it used to render.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo === 1 ? '1 month ago' : `${mo} months ago`;
}

function formatStudyTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

type SortKey = 'recent' | 'name' | 'notes' | 'study';

const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'recent', label: 'Recently opened' },
  { key: 'name',   label: 'Name A–Z' },
  { key: 'notes',  label: 'Most notes' },
  { key: 'study',  label: 'Study time' },
];

type ViewMode = 'grid' | 'list';
const VIEW_KEY = 'studysync_library_view';

function sortDocs(docs: LibraryDocument[], sort: SortKey, studyMap: Record<string, number>): LibraryDocument[] {
  return [...docs].sort((a, b) => {
    if (sort === 'recent') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (sort === 'name')   return a.name.localeCompare(b.name);
    if (sort === 'study')  return (studyMap[b.id] ?? 0) - (studyMap[a.id] ?? 0);
    return (b.textNoteCount + b.voiceNoteCount) - (a.textNoteCount + a.voiceNoteCount);
  });
}

// Hash-based tag color so a tag always gets the same colour across cards.
// Reuses the existing --note-{purple,blue,yellow,red}-{bg,text} pairs we
// already maintain in both themes, so light + dark are automatic.
const TAG_PALETTE = [
  { bg: 'var(--note-purple-bg)', text: 'var(--note-purple-text)' },
  { bg: 'var(--note-blue-bg)',   text: 'var(--note-blue-text)'   },
  { bg: 'var(--note-yellow-bg)', text: 'var(--note-yellow-text)' },
  { bg: 'var(--note-red-bg)',    text: 'var(--note-red-text)'    },
] as const;

function tagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h) + tag.charCodeAt(i);
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

const PRESET_TAGS = ['Math', 'CS', 'Physics', 'Biology', 'Chemistry', 'History', 'Literature', 'Economics', 'Psychology', 'Law'];

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({ doc, onConfirm, onCancel }: {
  doc: LibraryDocument; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div
        style={{
          background: 'var(--bg-float)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--bg-float-border)',
          boxShadow: 'var(--shadow-float)',
          borderRadius: 12, padding: '28px', width: 380,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Delete document?</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-1)' }}>{doc.name}</strong> and all its notes, drawings, and voice recordings will be permanently removed. This can&apos;t be undone.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ height: 34, padding: '0 16px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} style={{ height: 34, padding: '0 16px', borderRadius: 6, background: 'var(--red)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Tag editor popover ────────────────────────────────────────────────────────

function TagEditor({ docId, currentTags, allTags, onAdd, onRemove, onClose }: {
  docId: string; currentTags: string[]; allTags: string[];
  onAdd: (docId: string, tag: string) => void;
  onRemove: (docId: string, tag: string) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const handleAdd = (tag: string) => {
    const trimmed = tag.trim().slice(0, 30);
    if (!trimmed || currentTags.includes(trimmed)) return;
    onAdd(docId, trimmed);
    setInput('');
  };

  const suggestions = [...new Set([...PRESET_TAGS, ...allTags])]
    .filter((t) => !currentTags.includes(t) && t.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 6);

  return (
    <div
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
        width: 240, padding: 12,
        background: 'var(--bg-float)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--bg-float-border)',
        boxShadow: 'var(--shadow-float)',
        borderRadius: 10,
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Tags</p>
      {currentTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {currentTags.map((t) => {
            const c = tagColor(t);
            return (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 8px', borderRadius: 4, background: c.bg, color: c.text, fontSize: 11, fontWeight: 600 }}>
                {t}
                <button onClick={() => onRemove(docId, t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'currentColor', padding: 0, display: 'flex', opacity: 0.7 }} aria-label={`Remove ${t}`}>
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(input); } }}
          placeholder="New tag…"
          style={{
            flex: 1, height: 28, padding: '0 8px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 5, fontSize: 12, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => handleAdd(input)} disabled={!input.trim()}
          style={{
            width: 28, height: 28, borderRadius: 5,
            background: input.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
            color: input.trim() ? '#fff' : 'var(--text-3)',
            border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
          }}
        >
          <Plus size={13} />
        </button>
      </div>
      {suggestions.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {suggestions.map((s) => (
            <button key={s} onClick={() => handleAdd(s)} style={{ padding: '2px 7px', borderRadius: 4, background: 'transparent', border: '1px dashed var(--border)', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reopen modal — preserved from original (asks user to re-upload PDF) ──────

function ReopenModal({ doc, onClose }: { doc: LibraryDocument; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    setPendingReopenFile(file).finally(() => {
      sessionStorage.setItem('reopen_doc_id', doc.id);
      sessionStorage.setItem('reopen_doc_name', doc.name);
      window.location.href = '/workspace';
    });
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-float)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--bg-float-border)', boxShadow: 'var(--shadow-float)', borderRadius: 12, padding: '28px', width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Open document</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: 'var(--accent)' }}><FileText size={20} /></div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
              {doc.voiceNoteCount} recordings · {doc.drawingCount} drawings · {doc.textNoteCount} notes
            </p>
          </div>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
          Re-upload the original file to restore your notes and drawings.
        </p>
        <input ref={fileRef} type="file" accept=".pdf,.pptx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <button onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 40, borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Upload size={15} /> Upload file
        </button>
      </div>
    </div>
  );
}

// ── Card-row icon button (shared by grid + list hover actions) ────────────────

function IconBtn({
  title, onClick, children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 26, height: 26, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-2)', cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)' })}
      onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'var(--bg-panel)', color: 'var(--text-2)', borderColor: 'var(--border-subtle)' })}
    >
      {children}
    </button>
  );
}

// ── Document Card (grid view) ─────────────────────────────────────────────────

interface CardProps {
  doc: LibraryDocument;
  tags: string[];
  isFavorite: boolean;
  studySeconds: number;
  allTags: string[];
  onDelete: (doc: LibraryDocument) => void;
  onOpen: (doc: LibraryDocument) => void;
  onAddTag: (docId: string, tag: string) => void;
  onRemoveTag: (docId: string, tag: string) => void;
  onToggleFavorite: (docId: string) => void;
}

function DocCard({
  doc, tags, isFavorite, studySeconds, allTags,
  onDelete, onOpen, onAddTag, onRemoveTag, onToggleFavorite,
}: CardProps) {
  const [showTagEditor, setShowTagEditor] = useState(false);

  return (
    <div
      className="group"
      onClick={() => onOpen(doc)}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        cursor: 'pointer', overflow: 'hidden',
        transition: 'transform 0.13s, border-color 0.13s, box-shadow 0.13s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        transform: 'translateY(-2px)', borderColor: 'var(--accent)', boxShadow: 'var(--shadow-float)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        transform: 'translateY(0)', borderColor: 'var(--border-subtle)', boxShadow: 'none',
      })}
    >
      {/* Thumbnail skeleton */}
      <div style={{
        height: 124,
        background: 'var(--bg-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'relative',
      }}>
        <FileText size={36} strokeWidth={1.4} style={{ color: 'var(--text-3)', opacity: 0.4 }} />
        {isFavorite && (
          <Star size={13} fill="#f59e0b" style={{ position: 'absolute', top: 8, left: 8, color: '#f59e0b' }} />
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <p style={{
          margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {doc.name}
        </p>

        <p style={{
          margin: 0, display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, color: 'var(--text-3)',
        }}>
          <FileText size={11} style={{ flexShrink: 0 }} />
          {doc.pageCount ? `${doc.pageCount} pages` : `${doc.voiceNoteCount + doc.textNoteCount + doc.drawingCount} notes`}
          {' · '}
          {timeAgo(doc.updatedAt)}
        </p>

        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 8, minHeight: 22, marginTop: 2,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1, minWidth: 0 }}>
            {tags.slice(0, 3).map((tag) => {
              const c = tagColor(tag);
              return (
                <span key={tag} style={{
                  padding: '2px 7px', borderRadius: 4,
                  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em',
                  background: c.bg, color: c.text,
                  whiteSpace: 'nowrap',
                }}>{tag}</span>
              );
            })}
            {tags.length > 3 && (
              <span style={{ padding: '2px 4px', fontSize: 10.5, color: 'var(--text-3)' }}>
                +{tags.length - 3}
              </span>
            )}
          </div>

          {studySeconds > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
              padding: '2px 8px', borderRadius: 9999,
              fontSize: 10.5, fontWeight: 600,
              background: 'color-mix(in srgb, var(--green) 16%, transparent)',
              color: 'var(--green)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <Clock size={10} />
              {formatStudyTime(studySeconds)}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions: favorite, tag-edit, delete (top-right of thumbnail) */}
      <div
        className="opacity-0 group-hover:opacity-100"
        style={{
          position: 'absolute', top: 8, right: 8,
          display: 'flex', alignItems: 'center', gap: 4,
          opacity: 0, transition: 'opacity 0.12s',
        }}
      >
        <IconBtn title={isFavorite ? 'Unfavorite' : 'Favorite'} onClick={(e) => { e.stopPropagation(); onToggleFavorite(doc.id); }}>
          <Star size={13} fill={isFavorite ? '#f59e0b' : 'none'} color={isFavorite ? '#f59e0b' : 'currentColor'} />
        </IconBtn>
        <div style={{ position: 'relative' }}>
          <IconBtn title="Edit tags" onClick={(e) => { e.stopPropagation(); setShowTagEditor((v) => !v); }}>
            <Tag size={12} />
          </IconBtn>
          {showTagEditor && (
            <TagEditor
              docId={doc.id} currentTags={tags} allTags={allTags}
              onAdd={onAddTag} onRemove={onRemoveTag}
              onClose={() => setShowTagEditor(false)}
            />
          )}
        </div>
        <IconBtn title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(doc); }}>
          <Trash2 size={12} />
        </IconBtn>
      </div>
    </div>
  );
}

// ── Document Row (list view) ──────────────────────────────────────────────────

function DocRow({
  doc, tags, isFavorite, studySeconds, allTags,
  onDelete, onOpen, onAddTag, onRemoveTag, onToggleFavorite,
}: CardProps) {
  const [showTagEditor, setShowTagEditor] = useState(false);

  return (
    <div
      className="group"
      onClick={() => onOpen(doc)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 14px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', borderColor: 'var(--border)' })}
      onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)' })}
    >
      {/* Mini thumbnail */}
      <div style={{
        width: 40, height: 40, flexShrink: 0,
        borderRadius: 6, background: 'var(--bg-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
        {isFavorite && (
          <Star size={9} fill="#f59e0b" style={{ position: 'absolute', top: 2, right: 2, color: '#f59e0b' }} />
        )}
      </div>

      {/* Title + metadata */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {doc.name}
        </p>
        <p style={{
          margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, color: 'var(--text-3)',
        }}>
          <FileText size={10} style={{ flexShrink: 0 }} />
          {doc.pageCount ? `${doc.pageCount} pages` : `${doc.voiceNoteCount + doc.textNoteCount + doc.drawingCount} notes`}
          {' · '}
          {timeAgo(doc.updatedAt)}
        </p>
      </div>

      {/* Tags (compact) */}
      <div className="hidden md:flex" style={{ alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {tags.slice(0, 2).map((tag) => {
          const c = tagColor(tag);
          return (
            <span key={tag} style={{
              padding: '2px 7px', borderRadius: 4,
              fontSize: 10.5, fontWeight: 600,
              background: c.bg, color: c.text,
              whiteSpace: 'nowrap',
            }}>{tag}</span>
          );
        })}
        {tags.length > 2 && (
          <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>+{tags.length - 2}</span>
        )}
      </div>

      {/* Study time */}
      {studySeconds > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
          padding: '2px 8px', borderRadius: 9999,
          fontSize: 10.5, fontWeight: 600,
          background: 'color-mix(in srgb, var(--green) 16%, transparent)',
          color: 'var(--green)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <Clock size={10} />
          {formatStudyTime(studySeconds)}
        </span>
      )}

      {/* Hover actions */}
      <div
        className="opacity-0 group-hover:opacity-100"
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
          opacity: 0, transition: 'opacity 0.12s',
        }}
      >
        <IconBtn title={isFavorite ? 'Unfavorite' : 'Favorite'} onClick={(e) => { e.stopPropagation(); onToggleFavorite(doc.id); }}>
          <Star size={12} fill={isFavorite ? '#f59e0b' : 'none'} color={isFavorite ? '#f59e0b' : 'currentColor'} />
        </IconBtn>
        <div style={{ position: 'relative' }}>
          <IconBtn title="Edit tags" onClick={(e) => { e.stopPropagation(); setShowTagEditor((v) => !v); }}>
            <Tag size={12} />
          </IconBtn>
          {showTagEditor && (
            <TagEditor
              docId={doc.id} currentTags={tags} allTags={allTags}
              onAdd={onAddTag} onRemove={onRemoveTag}
              onClose={() => setShowTagEditor(false)}
            />
          )}
        </div>
        <IconBtn title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(doc); }}>
          <Trash2 size={12} />
        </IconBtn>
      </div>
    </div>
  );
}

// ── Filter-row button + dropdown helpers ──────────────────────────────────────

function FilterBtn({
  active = false, onClick, children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 38, padding: '0 12px',
        background: active ? 'var(--bg-hover)' : 'var(--bg-panel)',
        border: `1px solid ${active ? 'var(--border)' : 'var(--border-subtle)'}`,
        borderRadius: 8,
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        fontSize: 12.5, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
        whiteSpace: 'nowrap',
      }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        background: active ? 'var(--bg-hover)' : 'var(--bg-panel)',
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        borderColor: active ? 'var(--border)' : 'var(--border-subtle)',
      })}
    >
      {children}
    </button>
  );
}

function DropdownMenu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 4px)', right: 0,
      minWidth: 200,
      background: 'var(--bg-float)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid var(--bg-float-border)',
      boxShadow: 'var(--shadow-float)',
      borderRadius: 8, padding: 4, zIndex: 50,
    }}>
      {children}
    </div>
  );
}

function DropdownItem({
  active = false, onClick, children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', width: '100%',
        height: 32, padding: '0 10px',
        borderRadius: 6,
        background: active ? 'var(--accent-muted)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-1)',
        border: 'none', cursor: 'pointer',
        fontSize: 12.5, fontWeight: active ? 600 : 500,
        textAlign: 'left', fontFamily: 'inherit',
        transition: 'background 0.12s',
      }}
      onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
      onMouseOut={(e)  => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  useAuthGuard();

  const [docs, setDocs] = useState<LibraryDocument[]>([]);
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [studyMap, setStudyMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterFavorites, setFilterFavorites] = useState(false);

  const [view, setView] = useState<ViewMode>('grid');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [tagMenuOpen, setTagMenuOpen]   = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LibraryDocument | null>(null);
  const [openTarget, setOpenTarget]     = useState<LibraryDocument | null>(null);

  const sortRef = useRef<HTMLDivElement>(null);
  const tagRef  = useRef<HTMLDivElement>(null);

  // Hydrate view preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored === 'grid' || stored === 'list') setView(stored);
    } catch { /* private mode etc. */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* */ }
  }, [view]);

  // Fetch
  useEffect(() => {
    fetchLibraryDocuments().then(async (data) => {
      setDocs(data);
      const ids = data.map((d) => d.id);
      const [tags, allT, favs, study] = await Promise.all([
        getDocumentTagsMap(ids),
        getAllUserTags(),
        getFavoriteDocIds(),
        getStudyTimeMap(ids),
      ]);
      setTagsMap(tags);
      setAllTags(allT);
      setFavorites(favs);
      setStudyMap(study);
      setLoading(false);
    });
  }, []);

  // Close popovers on outside click
  useEffect(() => {
    if (!sortMenuOpen && !tagMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sortRef.current?.contains(t)) return;
      if (tagRef.current?.contains(t))  return;
      setSortMenuOpen(false);
      setTagMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sortMenuOpen, tagMenuOpen]);

  // Handlers
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    await deleteLibraryDocument(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setTagsMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setStudyMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setFavorites((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setDeleteTarget(null);
  }, [deleteTarget]);

  const handleAddTag = useCallback(async (docId: string, tag: string) => {
    await addDocumentTag(docId, tag);
    setTagsMap((prev) => ({ ...prev, [docId]: [...(prev[docId] ?? []), tag] }));
    setAllTags((prev) => [...new Set([...prev, tag])].sort());
  }, []);

  const handleRemoveTag = useCallback(async (docId: string, tag: string) => {
    await removeDocumentTag(docId, tag);
    setTagsMap((prev) => ({ ...prev, [docId]: (prev[docId] ?? []).filter((item) => item !== tag) }));
  }, []);

  const handleToggleFavorite = useCallback(async (docId: string) => {
    const nowFav = await toggleFavorite(docId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (nowFav) next.add(docId); else next.delete(docId);
      return next;
    });
  }, []);

  const usedTags = useMemo(
    () => [...new Set(Object.values(tagsMap).flat())].sort(),
    [tagsMap],
  );

  const filtered = useMemo(() => sortDocs(
    docs.filter((d) => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterFavorites && !favorites.has(d.id)) return false;
      if (filterTag && !(tagsMap[d.id] ?? []).includes(filterTag)) return false;
      return true;
    }),
    sort, studyMap,
  ), [docs, search, filterFavorites, favorites, filterTag, tagsMap, sort, studyMap]);

  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? '';
  const hasFilters = !!search || !!filterTag || filterFavorites;

  return (
    <div style={{ flex: 1, minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit' }}>
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 32px 60px' }}>

        {/* ══ HEADER ROW ══ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, marginBottom: 22, flexWrap: 'wrap',
        }}>
          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em',
            color: 'var(--text-1)',
          }}>
            My Library
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Grid / List toggle */}
            <div style={{
              display: 'flex', padding: 3, gap: 1,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
            }}>
              {(['grid', 'list'] as const).map((m) => {
                const active = view === m;
                const Icon = m === 'grid' ? Grid3X3 : List;
                return (
                  <button
                    key={m}
                    onClick={() => setView(m)}
                    title={m === 'grid' ? 'Grid view' : 'List view'}
                    aria-label={m === 'grid' ? 'Grid view' : 'List view'}
                    aria-pressed={active}
                    style={{
                      width: 30, height: 26, borderRadius: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: active ? 'var(--bg-active)' : 'transparent',
                      color: active ? 'var(--text-1)' : 'var(--text-3)',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseOver={(e) => { if (!active) Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-2)' }); }}
                    onMouseOut={(e)  => { if (!active) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)' }); }}
                  >
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>

            {/* Upload Document */}
            <a
              href="/workspace"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 36, padding: '0 14px', borderRadius: 8,
                background: 'var(--accent)', color: '#fff',
                fontSize: 13, fontWeight: 600,
                textDecoration: 'none', fontFamily: 'inherit',
                transition: 'background 0.13s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseOut={(e)  => { e.currentTarget.style.background = 'var(--accent)'; }}
            >
              <Upload size={14} /> Upload Document
            </a>
          </div>
        </div>

        {/* ══ FILTER ROW ══ */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 26, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              aria-label="Search documents"
              style={{
                width: '100%', height: 38, paddingLeft: 36, paddingRight: 14,
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8, fontSize: 13, color: 'var(--text-1)',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Sort */}
          <div ref={sortRef} style={{ position: 'relative', flexShrink: 0 }}>
            <FilterBtn
              active={sortMenuOpen}
              onClick={() => { setSortMenuOpen((v) => !v); setTagMenuOpen(false); }}
            >
              <ArrowUpDown size={13} />
              {activeSortLabel}
              <ChevronDown size={12} style={{ opacity: 0.6 }} />
            </FilterBtn>
            {sortMenuOpen && (
              <DropdownMenu>
                {SORT_OPTIONS.map(({ key, label }) => (
                  <DropdownItem
                    key={key}
                    active={sort === key}
                    onClick={() => { setSort(key); setSortMenuOpen(false); }}
                  >
                    {label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            )}
          </div>

          {/* Tag / favorites filter */}
          <div ref={tagRef} style={{ position: 'relative', flexShrink: 0 }}>
            <FilterBtn
              active={tagMenuOpen || !!filterTag || filterFavorites}
              onClick={() => { setTagMenuOpen((v) => !v); setSortMenuOpen(false); }}
            >
              <Filter size={13} />
              {filterTag ? filterTag : filterFavorites ? 'Favorites' : 'Filter by Tag'}
              {(filterTag || filterFavorites) && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setFilterTag(null); setFilterFavorites(false); }}
                  style={{ display: 'inline-flex', marginLeft: 2, cursor: 'pointer', opacity: 0.8 }}
                  aria-label="Clear filter"
                >
                  <X size={12} />
                </span>
              )}
            </FilterBtn>
            {tagMenuOpen && (
              <DropdownMenu>
                <DropdownItem
                  active={filterFavorites}
                  onClick={() => { setFilterFavorites((v) => !v); setTagMenuOpen(false); }}
                >
                  <Star size={12} fill={filterFavorites ? '#f59e0b' : 'none'} style={{ color: '#f59e0b', marginRight: 8 }} />
                  Favorites only
                </DropdownItem>
                {usedTags.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                    {usedTags.map((tag) => {
                      const c = tagColor(tag);
                      const active = filterTag === tag;
                      return (
                        <DropdownItem
                          key={tag}
                          active={active}
                          onClick={() => { setFilterTag(active ? null : tag); setTagMenuOpen(false); }}
                        >
                          <span style={{
                            width: 9, height: 9, borderRadius: 2,
                            background: c.text, marginRight: 8, flexShrink: 0,
                          }} />
                          {tag}
                        </DropdownItem>
                      );
                    })}
                  </>
                )}
                {usedTags.length === 0 && (
                  <p style={{
                    margin: 0, padding: '8px 10px',
                    fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5,
                  }}>
                    No tags yet. Hover a document and click the tag icon to add one.
                  </p>
                )}
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* ══ CONTENT ══ */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Loading…
          </div>
        ) : docs.length === 0 ? (
          // Fresh empty state — no documents at all
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{
              width: 72, height: 72, margin: '0 auto 18px',
              borderRadius: 16,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={30} style={{ color: 'var(--text-3)' }} />
            </div>
            <p style={{
              margin: '0 0 6px', fontSize: 16, fontWeight: 600,
              color: 'var(--text-1)',
            }}>
              No documents yet
            </p>
            <p style={{
              margin: '0 0 22px', fontSize: 13, color: 'var(--text-2)',
              lineHeight: 1.5, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto',
            }}>
              Upload your first PDF or PowerPoint to start studying.
            </p>
            <a
              href="/workspace"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 40, padding: '0 18px', borderRadius: 8,
                background: 'var(--accent)', color: '#fff',
                fontSize: 13.5, fontWeight: 600,
                textDecoration: 'none', fontFamily: 'inherit',
              }}
            >
              <Upload size={14} /> Upload Document
            </a>
          </div>
        ) : filtered.length === 0 ? (
          // Filtered to nothing
          <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-3)' }}>
            <Search size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
            <p style={{ margin: '0 0 10px', fontSize: 13.5 }}>
              No documents match your filters.
            </p>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setFilterTag(null); setFilterFavorites(false); }}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--accent)', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 18,
          }}>
            {filtered.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                tags={tagsMap[doc.id] ?? []}
                isFavorite={favorites.has(doc.id)}
                studySeconds={studyMap[doc.id] ?? 0}
                allTags={allTags}
                onDelete={setDeleteTarget}
                onOpen={setOpenTarget}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                tags={tagsMap[doc.id] ?? []}
                isFavorite={favorites.has(doc.id)}
                studySeconds={studyMap[doc.id] ?? 0}
                allTags={allTags}
                onDelete={setDeleteTarget}
                onOpen={setOpenTarget}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        )}
      </main>

      {deleteTarget && <DeleteModal doc={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />}
      {openTarget   && <ReopenModal doc={openTarget}   onClose={() => setOpenTarget(null)}     />}
    </div>
  );
}
