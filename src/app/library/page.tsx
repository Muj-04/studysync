'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, Mic, PenTool, StickyNote, Search, Trash2, Upload, X, BookOpen, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchLibraryDocuments, deleteLibraryDocument, getProfile, loadUserPreferences } from '@/lib/supabase/db';
import type { LibraryDocument } from '@/lib/supabase/db';
import AvatarDropdown from '@/components/AvatarDropdown';
import NotificationBell from '@/components/NotificationBell';
import { applyPreferences } from '@/lib/preferences';
import { storageSet, KEYS } from '@/lib/storage';

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

type SortKey = 'recent' | 'name' | 'notes';

function sortDocs(docs: LibraryDocument[], sort: SortKey): LibraryDocument[] {
  return [...docs].sort((a, b) => {
    if (sort === 'recent') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (sort === 'name') return a.name.localeCompare(b.name);
    return (b.textNoteCount + b.voiceNoteCount) - (a.textNoteCount + a.voiceNoteCount);
  });
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({ doc, onConfirm, onCancel }: {
  doc: LibraryDocument;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '28px 28px 24px', width: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
          Delete document?
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-1)' }}>{doc.name}</strong> and all its notes, drawings, bookmarks, and voice recordings will be permanently deleted.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              height: 34, padding: '0 16px', borderRadius: 8,
              background: 'var(--bg-elevated)', color: 'var(--text-2)',
              border: '1px solid var(--border)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 34, padding: '0 16px', borderRadius: 8,
              background: '#ef4444', color: '#fff',
              border: 'none', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocCard({ doc, onDelete, onOpen }: {
  doc: LibraryDocument;
  onDelete: (doc: LibraryDocument) => void;
  onOpen: (doc: LibraryDocument) => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--bg-panel)', border: `1px solid ${hover ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12, padding: '18px 18px 14px',
        cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: hover ? '0 4px 20px rgba(0,0,0,0.2)' : 'none',
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 12,
      }}
      onClick={() => onOpen(doc)}
    >
      {/* Icon + name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: 'var(--accent-muted)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileText size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: '0 0 3px', fontSize: 13.5, fontWeight: 600,
            color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {doc.name}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
            Last opened {timeAgo(doc.updatedAt)}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {doc.voiceNoteCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
            <Mic size={11} /> {doc.voiceNoteCount} recording{doc.voiceNoteCount !== 1 ? 's' : ''}
          </span>
        )}
        {doc.drawingCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
            <PenTool size={11} /> {doc.drawingCount} drawing{doc.drawingCount !== 1 ? 's' : ''}
          </span>
        )}
        {doc.textNoteCount > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-3)' }}>
            <StickyNote size={11} /> {doc.textNoteCount} note{doc.textNoteCount !== 1 ? 's' : ''}
          </span>
        )}
        {doc.voiceNoteCount === 0 && doc.drawingCount === 0 && doc.textNoteCount === 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>No annotations yet</span>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
        title="Delete document"
        style={{
          position: 'absolute', top: 10, right: 10,
          width: 28, height: 28, borderRadius: 6,
          background: hover ? 'var(--bg-elevated)' : 'transparent',
          border: 'none', color: hover ? '#ef4444' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Re-open modal (upload to restore) ────────────────────────────────────────

function ReopenModal({ doc, onClose }: { doc: LibraryDocument; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.pptx')) return;
    // Store docId so workspace restores data for this document
    sessionStorage.setItem('reopen_doc_id', doc.id);
    sessionStorage.setItem('reopen_doc_name', doc.name);
    // Navigate to workspace and let PDFUploader handle it
    window.location.href = '/workspace';
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '28px', width: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
            Open Document
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 10, padding: '16px',
          marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ color: 'var(--accent)' }}><FileText size={20} /></div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{doc.name}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
              {doc.voiceNoteCount} recording{doc.voiceNoteCount !== 1 ? 's' : ''} · {doc.drawingCount} drawing{doc.drawingCount !== 1 ? 's' : ''} · {doc.textNoteCount} note{doc.textNoteCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
          Upload the file again to restore all your notes, drawings, bookmarks, and voice recordings.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.pptx"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: '100%', height: 42, borderRadius: 10,
            background: 'var(--accent)', color: '#fff',
            border: 'none', fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Upload size={15} /> Upload File
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [docs, setDocs] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [deleteTarget, setDeleteTarget] = useState<LibraryDocument | null>(null);
  const [openTarget, setOpenTarget] = useState<LibraryDocument | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setUserEmail(user?.email ?? '');
      const profile = await getProfile();
      setUserDisplayName(profile?.username ?? user?.email?.split('@')[0] ?? '');
      setUserAvatarUrl(profile?.avatarUrl ?? null);
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

    fetchLibraryDocuments().then((data) => {
      setDocs(data);
      setLoading(false);
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteLibraryDocument(deleteTarget.id);
    setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    setDeleteTarget(null);
  }, [deleteTarget]);

  const filtered = sortDocs(
    docs.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())),
    sort,
  );

  const navLinks = [
    { label: 'Dashboard', href: '/dashboard', active: false },
    { label: 'Workspace', href: '/workspace', active: false },
    { label: 'Library', href: '/library', active: true },
    { label: 'Community', href: '/community', active: false },
    { label: 'Settings', href: '/settings', active: false },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit' }}>

      {/* Header */}
      <header style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-app)', position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
            StudySync
          </span>
          <nav style={{ display: 'flex', gap: 2 }}>
            {navLinks.map(({ label, href, active }) => (
              <a
                key={label}
                href={href}
                style={{
                  fontSize: 13, fontWeight: 400,
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
                  borderBottom: active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  transition: 'color 0.15s',
                }}
                onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
                onMouseOut={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)'; }}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a
            href="/friends"
            title="Friends"
            style={{
              width: 34, height: 34, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-2)', textDecoration: 'none',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' })}
          >
            <Users size={16} />
          </a>
          <NotificationBell />
          <AvatarDropdown email={userEmail} displayName={userDisplayName} avatarUrl={userAvatarUrl} />
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Page title + controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>
              <BookOpen size={20} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent)' }} />
              My Library
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
              {docs.length} document{docs.length !== 1 ? 's' : ''} · all your notes and recordings are saved
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Sort */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
              {([['recent', 'Recent'], ['name', 'A–Z'], ['notes', 'Most notes']] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  style={{
                    height: 28, padding: '0 10px', borderRadius: 6,
                    background: sort === key ? 'var(--accent)' : 'transparent',
                    color: sort === key ? '#fff' : 'var(--text-2)',
                    border: 'none', fontSize: 12, fontWeight: sort === key ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s, color 0.12s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                style={{
                  height: 34, paddingLeft: 30, paddingRight: 12,
                  background: 'var(--bg-panel)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 13, color: 'var(--text-1)',
                  outline: 'none', fontFamily: 'inherit', width: 200,
                }}
              />
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Loading library…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)' }}>
            {search ? (
              <>
                <Search size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <p style={{ fontSize: 14, margin: 0 }}>No documents match &quot;{search}&quot;</p>
              </>
            ) : (
              <>
                <BookOpen size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-2)' }}>
                  Your library is empty
                </p>
                <p style={{ fontSize: 13, margin: 0 }}>
                  Open a PDF or PPTX in the Workspace — it will appear here automatically.
                </p>
                <a
                  href="/workspace"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20,
                    height: 40, padding: '0 20px', borderRadius: 10,
                    background: 'var(--accent)', color: '#fff',
                    textDecoration: 'none', fontSize: 13.5, fontWeight: 600,
                  }}
                >
                  Go to Workspace
                </a>
              </>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {filtered.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                onDelete={setDeleteTarget}
                onOpen={setOpenTarget}
              />
            ))}
          </div>
        )}
      </main>

      {deleteTarget && (
        <DeleteModal
          doc={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {openTarget && (
        <ReopenModal
          doc={openTarget}
          onClose={() => setOpenTarget(null)}
        />
      )}
    </div>
  );
}
