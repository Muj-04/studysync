'use client';
import { useEffect, useState } from 'react';
import { FileText, Mic, Bookmark as BookmarkIcon, LogOut, Play, ArrowRight, BookOpen, MessageSquare } from 'lucide-react';
import { storageGet, KEYS } from '@/lib/storage';
import type { TextNote, Bookmark } from '@/types';

interface PersistedVoiceNote {
  id: string;
  documentId: string;
  pageNumber: number | string;
  duration: number;
  timestamp: string;
  title?: string;
}

interface SessionData {
  docId: string;
  virtualIndex: number;
}

interface DocEntry {
  id: string;
  name: string;
  voiceNoteCount: number;
  textNoteCount: number;
  bookmarkCount: number;
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ color, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [totalVoiceNotes, setTotalVoiceNotes] = useState(0);
  const [totalTextNotes, setTotalTextNotes] = useState(0);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [allBookmarks, setAllBookmarks] = useState<Array<Bookmark & { docName: string }>>([]);
  const [session, setSession] = useState<SessionData | null>(null);
  const [lastDocName, setLastDocName] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('isLoggedIn')) {
      window.location.replace('/login');
      return;
    }

    const theme = storageGet<string>(KEYS.THEME) ?? localStorage.getItem('theme');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }

    const docMap = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
    const voiceNotes = storageGet<PersistedVoiceNote[]>(KEYS.VOICE_NOTES) ?? [];
    const textNotes = storageGet<Record<string, TextNote[]>>(KEYS.TEXT_NOTES) ?? {};
    const bookmarksAll = storageGet<Record<string, Bookmark[]>>(KEYS.BOOKMARKS) ?? {};
    const sess = storageGet<SessionData>(KEYS.SESSION);

    const docIdToName: Record<string, string> = {};
    for (const [name, id] of Object.entries(docMap)) docIdToName[id] = name;

    const voiceCountByDoc: Record<string, number> = {};
    voiceNotes.forEach((n) => { voiceCountByDoc[n.documentId] = (voiceCountByDoc[n.documentId] ?? 0) + 1; });

    const textCountByDoc: Record<string, number> = {};
    Object.entries(textNotes).forEach(([key, notes]) => {
      const docId = key.split(':')[0];
      textCountByDoc[docId] = (textCountByDoc[docId] ?? 0) + notes.length;
    });

    const bookmarkCountByDoc: Record<string, number> = {};
    Object.entries(bookmarksAll).forEach(([docId, marks]) => { bookmarkCountByDoc[docId] = marks.length; });

    const docEntries: DocEntry[] = Object.entries(docMap).map(([name, id]) => ({
      id, name,
      voiceNoteCount: voiceCountByDoc[id] ?? 0,
      textNoteCount: textCountByDoc[id] ?? 0,
      bookmarkCount: bookmarkCountByDoc[id] ?? 0,
    }));

    setDocs(docEntries);
    setTotalVoiceNotes(voiceNotes.length);
    setTotalTextNotes(Object.values(textNotes).reduce((sum, arr) => sum + arr.length, 0));
    setTotalBookmarks(Object.values(bookmarksAll).reduce((sum, arr) => sum + arr.length, 0));

    const flatBookmarks = Object.entries(bookmarksAll)
      .flatMap(([docId, marks]) => marks.map((bm) => ({ ...bm, docName: docIdToName[docId] ?? 'Unknown' })))
      .slice(0, 6);
    setAllBookmarks(flatBookmarks);

    setSession(sess);
    if (sess) setLastDocName(docIdToName[sess.docId] ?? null);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit' }}>

      {/* ── Header ── */}
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
            {[
              { label: 'Dashboard', href: '/dashboard', active: true },
              { label: 'Workspace', href: '/workspace', active: false },
            ].map(({ label, href, active }) => (
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
        <button
          onClick={handleLogout}
          style={{
            height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 6,
            borderRadius: 8, background: 'transparent', border: '1px solid transparent',
            color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            transition: 'background 0.13s, color 0.13s, border-color 0.13s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--red-muted)', color: 'var(--red)', borderColor: 'rgba(229,72,77,.22)' })}
          onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent' })}
        >
          <LogOut size={15} />
          Log out
        </button>
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* ── Continue studying banner ── */}
        {session && (
          <div style={{
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '22px 28px', marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.02em' }}>
                Continue where you left off
              </p>
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: lastDocName ? 4 : 0 }}>
                {lastDocName ?? 'Last session'}
              </p>
              {session.virtualIndex > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Page {session.virtualIndex + 1}
                </p>
              )}
            </div>
            <a
              href="/workspace"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 42, padding: '0 22px', borderRadius: 10,
                background: 'var(--accent)', color: '#fff',
                textDecoration: 'none', fontSize: 13.5, fontWeight: 600, flexShrink: 0,
                transition: 'background 0.13s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--accent-hover)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--accent)'; }}
            >
              <Play size={14} fill="currentColor" />
              Continue Studying
            </a>
          </div>
        )}

        {/* ── Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          <StatCard label="Documents"   value={docs.length}      icon={<FileText size={20} />}     color="var(--accent)" />
          <StatCard label="Voice Notes" value={totalVoiceNotes}  icon={<Mic size={20} />}           color="#a78bfa" />
          <StatCard label="Text Notes"  value={totalTextNotes}   icon={<MessageSquare size={20} />} color="#34d399" />
          <StatCard label="Bookmarks"   value={totalBookmarks}   icon={<BookmarkIcon size={20} />}  color="#f59e0b" />
        </div>

        {/* ── Two-column section ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Recent Documents */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{
              padding: '15px 18px', borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Recent Documents</span>
              <a
                href="/workspace"
                style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}
                onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
              >
                Open workspace →
              </a>
            </div>
            <div style={{ padding: '6px 8px', maxHeight: 340, overflowY: 'auto' }}>
              {docs.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                    No documents yet.<br />Open the workspace to upload files.
                  </p>
                </div>
              ) : docs.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 10px', borderRadius: 8, marginBottom: 2, cursor: 'default',
                    transition: 'background 0.1s',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileText size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)', marginBottom: 5,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {doc.name}
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {doc.voiceNoteCount > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Mic size={9} style={{ color: '#a78bfa' }} /> {doc.voiceNoteCount}
                        </span>
                      )}
                      {doc.textNoteCount > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <MessageSquare size={9} style={{ color: '#34d399' }} /> {doc.textNoteCount}
                        </span>
                      )}
                      {doc.bookmarkCount > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <BookmarkIcon size={9} style={{ color: '#f59e0b' }} /> {doc.bookmarkCount}
                        </span>
                      )}
                      {doc.voiceNoteCount === 0 && doc.textNoteCount === 0 && doc.bookmarkCount === 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>No notes yet</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Bookmarks */}
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Quick Bookmarks</span>
            </div>
            <div style={{ padding: '6px 8px', maxHeight: 340, overflowY: 'auto' }}>
              {allBookmarks.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                    No bookmarks yet.<br />Bookmark pages while studying to access them here.
                  </p>
                </div>
              ) : allBookmarks.map((bm) => (
                <a
                  key={bm.id}
                  href="/workspace"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 8, marginBottom: 2,
                    textDecoration: 'none', transition: 'background 0.1s',
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
                >
                  <BookmarkIcon size={12} fill="#f59e0b" style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {bm.label}
                    </p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bm.docName}
                    </p>
                  </div>
                  <ArrowRight size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ── Empty-state CTA (no docs + no session) ── */}
        {docs.length === 0 && !session && (
          <div style={{ marginTop: 40, textAlign: 'center', padding: '32px 24px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, margin: '0 auto 20px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BookOpen size={24} style={{ color: 'var(--text-2)' }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>Start studying today</p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 22 }}>
              Upload a PDF or PowerPoint in the workspace to get started.
            </p>
            <a
              href="/workspace"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 42, padding: '0 22px', borderRadius: 10,
                background: 'var(--accent)', color: '#fff', textDecoration: 'none',
                fontSize: 13.5, fontWeight: 600, transition: 'background 0.13s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--accent-hover)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--accent)'; }}
            >
              <BookOpen size={14} />
              Open Workspace
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
