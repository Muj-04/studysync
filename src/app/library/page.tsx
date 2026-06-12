'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  FileText, Mic, PenTool, StickyNote, Search, Trash2, Upload, X,
  BookOpen, Users, Star, Tag, Clock, Plus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchLibraryDocuments, deleteLibraryDocument, getProfile, loadUserPreferences,
  getDocumentTagsMap, getAllUserTags, addDocumentTag, removeDocumentTag,
  getFavoriteDocIds, toggleFavorite, getStudyTimeMap,
} from '@/lib/supabase/db';
import type { LibraryDocument } from '@/lib/supabase/db';
import AvatarDropdown from '@/components/AvatarDropdown';
import NotificationBell from '@/components/NotificationBell';
import { applyPreferences } from '@/lib/preferences';
import { storageSet, KEYS } from '@/lib/storage';
import { useLanguage } from '@/contexts/LanguageContext';
import { setPendingReopenFile } from '@/lib/pendingReopenFile';

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
  if (seconds < 60) return `${seconds}s studied`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m studied`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m studied` : `${h}h studied`;
}

type SortKey = 'recent' | 'name' | 'notes' | 'study';

function sortDocs(docs: LibraryDocument[], sort: SortKey, studyMap: Record<string, number>): LibraryDocument[] {
  return [...docs].sort((a, b) => {
    if (sort === 'recent') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'study') return (studyMap[b.id] ?? 0) - (studyMap[a.id] ?? 0);
    return (b.textNoteCount + b.voiceNoteCount) - (a.textNoteCount + a.voiceNoteCount);
  });
}

const PRESET_TAGS = ['Math', 'CS', 'Physics', 'Biology', 'Chemistry', 'History', 'Literature', 'Economics', 'Psychology', 'Law'];

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({ doc, onConfirm, onCancel }: {
  doc: LibraryDocument; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-float)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--bg-float-border)',
        boxShadow: 'var(--shadow-float)',
        borderRadius: 4, padding: '28px 28px 24px', width: 360,
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{t('lib_delete_title')}</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-1)' }}>{doc.name}</strong> {t('lib_delete_body')}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ height: 34, padding: '0 16px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>{t('common_cancel')}</button>
          <button onClick={onConfirm} style={{ height: 34, padding: '0 16px', borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t('lib_delete_btn')}</button>
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
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const suggestions = [...new Set([...PRESET_TAGS, ...allTags])]
    .filter((tag) => !currentTags.includes(tag) && tag.toLowerCase().includes(input.toLowerCase()));

  const handleAdd = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || currentTags.includes(trimmed)) return;
    onAdd(docId, trimmed);
    setInput('');
  };

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 200,
      background: 'var(--bg-float)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid var(--bg-float-border)',
      boxShadow: 'var(--shadow-float)',
      borderRadius: 4, padding: '12px', width: 240, marginTop: 4,
    }}>
      {currentTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {currentTags.map((tag) => (
            <span key={tag} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', borderRadius: 4,
              background: 'var(--accent)', color: '#fff', fontSize: 11.5, fontWeight: 500,
            }}>
              {tag}
              <button onClick={() => onRemove(docId, tag)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0,
                display: 'flex', fontSize: 10, lineHeight: 1,
              }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(input); }}
          placeholder={t('lib_add_tag_placeholder')}
          style={{
            flex: 1, height: 28, padding: '0 8px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 4, fontSize: 12, color: 'var(--text-1)',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button onClick={() => handleAdd(input)} style={{
          width: 28, height: 28, borderRadius: 4, background: 'var(--accent)', color: '#fff',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Plus size={12} />
        </button>
      </div>
      {suggestions.slice(0, 6).map((s) => (
        <button key={s} onClick={() => handleAdd(s)} style={{
          display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px',
          background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4,
          fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'inherit',
          transition: 'background 0.1s',
        }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >{s}</button>
      ))}
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocCard({ doc, tags, isFavorite, studySeconds, allTags, onDelete, onOpen, onAddTag, onRemoveTag, onToggleFavorite }: {
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
}) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--bg-panel)', border: `1px solid ${hover ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 4, padding: '18px 18px 14px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: hover ? '0 4px 20px rgba(0,0,0,0.2)' : 'none',
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }} onClick={() => onOpen(doc)}>
        <div style={{
          width: 40, height: 40, borderRadius: 4, flexShrink: 0,
          background: 'var(--accent-muted)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileText size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 3px', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {doc.name}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
            {t('lib_last_opened')} {timeAgo(doc.updatedAt)}{doc.pageCount ? ` · ${doc.pageCount} ${t('lib_pages')}` : ''}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, position: 'relative' }}>
        {tags.map((tag) => (
          <span key={tag} style={{
            padding: '2px 8px', borderRadius: 4,
            background: 'var(--accent-muted)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 500,
          }}>{tag}</span>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); setShowTagEditor((v) => !v); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4,
            background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-3)',
            fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', color: 'var(--accent)' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', color: 'var(--text-3)' })}
        >
          <Tag size={10} /> {tags.length === 0 ? t('lib_add_tag_btn') : '+'}
        </button>
        {showTagEditor && (
          <TagEditor
            docId={doc.id} currentTags={tags} allTags={allTags}
            onAdd={onAddTag} onRemove={onRemoveTag}
            onClose={() => setShowTagEditor(false)}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {studySeconds > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--accent)', fontWeight: 500 }}>
            <Clock size={11} /> {formatStudyTime(studySeconds)}
          </span>
        )}
        {doc.voiceNoteCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
            <Mic size={11} /> {doc.voiceNoteCount} {doc.voiceNoteCount !== 1 ? t('lib_recordings') : t('lib_recording')}
          </span>
        )}
        {doc.drawingCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
            <PenTool size={11} /> {doc.drawingCount} {doc.drawingCount !== 1 ? t('lib_drawings') : t('lib_drawing')}
          </span>
        )}
        {doc.textNoteCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
            <StickyNote size={11} /> {doc.textNoteCount} {doc.textNoteCount !== 1 ? t('lib_notes') : t('lib_note')}
          </span>
        )}
        {studySeconds === 0 && doc.voiceNoteCount === 0 && doc.drawingCount === 0 && doc.textNoteCount === 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('lib_no_annotations')}</span>
        )}
      </div>

      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(doc.id); }}
          title={isFavorite ? t('lib_fav_remove') : t('lib_fav_add')}
          style={{
            width: 28, height: 28, borderRadius: 4, background: 'transparent', border: 'none',
            color: isFavorite ? '#f59e0b' : hover ? 'var(--text-3)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'color 0.12s',
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f59e0b'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = isFavorite ? '#f59e0b' : hover ? 'var(--text-3)' : 'transparent'; }}
        >
          <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
          title={t('lib_delete_tooltip')}
          style={{
            width: 28, height: 28, borderRadius: 4, background: 'transparent', border: 'none',
            color: hover ? '#ef4444' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'color 0.12s',
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Re-open modal ─────────────────────────────────────────────────────────────

function ReopenModal({ doc, onClose }: { doc: LibraryDocument; onClose: () => void }) {
  const { t } = useLanguage();
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
      <div style={{ background: 'var(--bg-float)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--bg-float-border)', boxShadow: 'var(--shadow-float)', borderRadius: 4, padding: '28px', width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{t('lib_open_doc')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, padding: '16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: 'var(--accent)' }}><FileText size={20} /></div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{doc.name}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
              {doc.voiceNoteCount} {doc.voiceNoteCount !== 1 ? t('lib_recordings') : t('lib_recording')} · {doc.drawingCount} {doc.drawingCount !== 1 ? t('lib_drawings') : t('lib_drawing')} · {doc.textNoteCount} {doc.textNoteCount !== 1 ? t('lib_notes') : t('lib_note')}
            </p>
          </div>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
          {t('lib_upload_restore')}
        </p>
        <input ref={fileRef} type="file" accept=".pdf,.pptx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <button onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 42, borderRadius: 4, background: '#ffffff', color: '#0f172a', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Upload size={15} /> {t('lib_upload_file')}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const { t } = useLanguage();
  const [docs, setDocs] = useState<LibraryDocument[]>([]);
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [studyMap, setStudyMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryDocument | null>(null);
  const [openTarget, setOpenTarget] = useState<LibraryDocument | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [isVip, setIsVip] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setUserEmail(user?.email ?? '');
      const profile = await getProfile();
      setUserDisplayName(profile?.username ?? user?.email?.split('@')[0] ?? '');
      setUserAvatarUrl(profile?.avatarUrl ?? null);
      if (profile?.isVip) setIsVip(true);
    });

    loadUserPreferences().then((prefs) => {
      if (!prefs) return;
      if (prefs.accent_color) storageSet(KEYS.ACCENT_COLOR, prefs.accent_color);
      if (prefs.font_size) storageSet(KEYS.FONT_SIZE, prefs.font_size);
      if (prefs.font_family) storageSet(KEYS.FONT_FAMILY, prefs.font_family);
      if (prefs.bg_color !== undefined) storageSet(KEYS.BG_COLOR, prefs.bg_color);
      if (prefs.sidebar_color !== undefined) storageSet(KEYS.SIDEBAR_COLOR, prefs.sidebar_color);
      if (prefs.theme) storageSet(KEYS.THEME, prefs.theme);
      applyPreferences({
        theme: (prefs.theme as 'dark' | 'light') ?? undefined,
        fontSize: (prefs.font_size as 'small' | 'medium' | 'large') ?? undefined,
        accentColor: prefs.accent_color ?? undefined,
        bgColor: prefs.bg_color,
        sidebarColor: prefs.sidebar_color,
        fontFamily: (prefs.font_family as 'default' | 'serif' | 'mono') ?? undefined,
      });
    });

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

  const usedTags = [...new Set(Object.values(tagsMap).flat())].sort();

  const filtered = sortDocs(
    docs.filter((d) => {
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterFavorites && !favorites.has(d.id)) return false;
      if (filterTag && !(tagsMap[d.id] ?? []).includes(filterTag)) return false;
      return true;
    }),
    sort, studyMap,
  );

  const navLinks = [
    { label: t('nav_dashboard'), href: '/dashboard', active: false },
    { label: t('nav_workspace'), href: '/workspace', active: false },
    { label: t('nav_library'), href: '/library', active: true },
    { label: t('nav_community'), href: '/community', active: false },
    { label: t('nav_settings'), href: '/settings', active: false },
  ];

  const sortOptions: [SortKey, string][] = [
    ['recent', t('lib_sort_recent')],
    ['name', t('lib_sort_az')],
    ['notes', t('lib_sort_notes')],
    ['study', t('lib_sort_time')],
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit' }}>
      <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-app)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>StudySync</span>
          <nav style={{ display: 'flex', gap: 2 }}>
            {navLinks.map(({ label, href, active }) => (
              <a key={href} href={href} style={{ fontSize: 13, fontWeight: 400, color: active ? 'var(--accent)' : 'var(--text-2)', textDecoration: 'none', padding: '4px 10px', borderRadius: 4, borderBottom: active ? '1.5px solid var(--accent)' : '1.5px solid transparent', transition: 'color 0.15s' }}
                onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
                onMouseOut={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)'; }}
              >{label}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/friends" title={t('nav_friends')} style={{ width: 34, height: 34, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', textDecoration: 'none', transition: 'background 0.12s, color 0.12s' }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' })}
          ><Users size={16} /></a>
          <NotificationBell />
          <AvatarDropdown email={userEmail} displayName={userDisplayName} avatarUrl={userAvatarUrl} isVip={isVip} />
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>
              <BookOpen size={20} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent)' }} />
              {t('lib_title')}
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
              {docs.length} {docs.length !== 1 ? t('lib_documents') : t('lib_document')} {t('lib_saved_hint')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterFavorites((v) => !v)}
              style={{
                height: 34, padding: '0 12px', borderRadius: 4,
                background: filterFavorites ? '#f59e0b' : 'var(--bg-panel)',
                color: filterFavorites ? '#fff' : 'var(--text-2)',
                border: `1px solid ${filterFavorites ? '#f59e0b' : 'var(--border)'}`,
                fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.12s',
              }}
            >
              <Star size={13} fill={filterFavorites ? 'currentColor' : 'none'} /> {t('lib_favorites')}
            </button>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, padding: 3 }}>
              {sortOptions.map(([key, label]) => (
                <button key={key} onClick={() => setSort(key)} style={{ height: 28, padding: '0 10px', borderRadius: 4, background: sort === key ? 'var(--accent)' : 'transparent', color: sort === key ? '#fff' : 'var(--text-2)', border: 'none', fontSize: 12, fontWeight: sort === key ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s, color 0.12s' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('lib_search_placeholder')} style={{ height: 34, paddingLeft: 30, paddingRight: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', width: 200 }} />
            </div>
          </div>
        </div>

        {usedTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {usedTags.map((tag) => (
              <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)} style={{
                padding: '4px 10px', borderRadius: 4,
                background: filterTag === tag ? 'var(--accent)' : 'var(--bg-panel)',
                color: filterTag === tag ? '#fff' : 'var(--text-2)',
                border: `1px solid ${filterTag === tag ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 12, fontWeight: filterTag === tag ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.12s',
              }}>{tag}</button>
            ))}
            {filterTag && (
              <button onClick={() => setFilterTag(null)} style={{ padding: '4px 10px', borderRadius: 4, background: 'none', border: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {t('lib_clear_filters')} ×
              </button>
            )}
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>{t('lib_loading')}</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)' }}>
            {search || filterTag || filterFavorites ? (
              <>
                <Search size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <p style={{ fontSize: 14, margin: 0 }}>{t('lib_empty_filter')}</p>
                <button onClick={() => { setSearch(''); setFilterTag(null); setFilterFavorites(false); }} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>{t('lib_clear_filters')}</button>
              </>
            ) : (
              <>
                <BookOpen size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-2)' }}>{t('lib_empty_title')}</p>
                <p style={{ fontSize: 13, margin: 0 }}>{t('lib_empty_desc')}</p>
                <a href="/workspace" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20, height: 40, padding: '0 20px', borderRadius: 4, background: '#ffffff', color: '#0f172a', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
                  {t('lib_go_workspace')}
                </a>
              </>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map((doc) => (
              <DocCard
                key={doc.id} doc={doc}
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
      {openTarget && <ReopenModal doc={openTarget} onClose={() => setOpenTarget(null)} />}
    </div>
  );
}
