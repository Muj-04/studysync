'use client';
import { useEffect, useState } from 'react';
import { FileText, Mic, Bookmark as BookmarkIcon, Play, ArrowRight, BookOpen, MessageSquare, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchDashboardData, fetchSessionState, loadUserPreferences, getProfile, getStudyStreak } from '@/lib/supabase/db';
import AvatarDropdown from '@/components/AvatarDropdown';
import NotificationBell from '@/components/NotificationBell';
import { applyPreferences } from '@/lib/preferences';
import { storageSet, KEYS } from '@/lib/storage';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSessionGuard } from '@/hooks/useSessionGuard';

interface DocEntry {
  id: string;
  name: string;
  voiceNoteCount: number;
  textNoteCount: number;
  bookmarkCount: number;
}

interface BookmarkEntry {
  id: string;
  documentId: string;
  virtualIndex: number;
  label: string;
  docName: string;
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 4, padding: '16px 18px',
    }}>
      <div style={{ color, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  useSessionGuard({ onKicked: () => { window.location.href = '/login?kicked=1'; } });
  const { t } = useLanguage();
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [totalVoiceNotes, setTotalVoiceNotes] = useState(0);
  const [totalTextNotes, setTotalTextNotes] = useState(0);
  const [totalBookmarks, setTotalBookmarks] = useState(0);
  const [allBookmarks, setAllBookmarks] = useState<BookmarkEntry[]>([]);
  const [session, setSession] = useState<{ docId: string; virtualIndex: number } | null>(null);
  const [lastDocName, setLastDocName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'premium' | 'pro'>('free');
  const [isVip, setIsVip] = useState(false);
  const [studyStreak, setStudyStreak] = useState(0);

  useEffect(() => {
    // Load user info
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setUserEmail(user?.email ?? '');
      const profile = await getProfile();
      setUserDisplayName(profile?.username ?? user?.email?.split('@')[0] ?? '');
      setUserAvatarUrl(profile?.avatarUrl ?? null);
      if (profile?.plan) setUserPlan(profile.plan as 'free' | 'premium' | 'pro');
      if (profile?.isVip) setIsVip(true);
    });

    // Load and apply cross-device preferences from Supabase
    loadUserPreferences().then((prefs) => {
      if (!prefs) return;
      if (prefs.accent_color) storageSet(KEYS.ACCENT_COLOR, prefs.accent_color);
      if (prefs.font_size)    storageSet(KEYS.FONT_SIZE, prefs.font_size);
      if (prefs.font_family)  storageSet(KEYS.FONT_FAMILY, prefs.font_family);
      if (prefs.bg_color !== undefined) storageSet(KEYS.BG_COLOR, prefs.bg_color);
      if (prefs.sidebar_color !== undefined) storageSet(KEYS.SIDEBAR_COLOR, prefs.sidebar_color);
      if (prefs.theme)        storageSet(KEYS.THEME, prefs.theme);
      applyPreferences({
        theme:        (prefs.theme as 'dark' | 'light') ?? undefined,
        fontSize:     (prefs.font_size as 'small' | 'medium' | 'large') ?? undefined,
        accentColor:  prefs.accent_color ?? undefined,
        bgColor:      prefs.bg_color,
        sidebarColor: prefs.sidebar_color,
        fontFamily:   (prefs.font_family as 'default' | 'serif' | 'mono') ?? undefined,
      });
    });

    Promise.all([fetchDashboardData(), fetchSessionState()]).then(([data, sess]) => {
      if (data) {
        setDocs(data.docs);
        setTotalVoiceNotes(data.totalVoiceNotes);
        setTotalTextNotes(data.totalTextNotes);
        setTotalBookmarks(data.totalBookmarks);
        setAllBookmarks(data.recentBookmarks);
        if (sess) {
          setSession(sess);
          const found = data.docs.find((d) => d.id === sess.docId);
          setLastDocName(found?.name ?? null);
        }
      }
      setLoading(false);
    });
    getStudyStreak().then(setStudyStreak);
  }, []);

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
              { label: t('nav_dashboard'), href: '/dashboard', active: true },
              { label: t('nav_workspace'), href: '/workspace', active: false },
              { label: t('nav_library'),   href: '/library',   active: false },
              { label: t('nav_community'), href: '/community', active: false },
              { label: t('nav_settings'),  href: '/settings',  active: false },
              { label: t('dash_pricing'),   href: '/pricing',   active: false },
            ].map(({ label, href, active }) => (
              <a
                key={label}
                href={href}
                style={{
                  fontSize: 13, fontWeight: 400,
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  textDecoration: 'none', padding: '4px 10px', borderRadius: 4,
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
          {userPlan === 'free' && (
            <a
              href="/pricing"
              style={{
                fontSize: 12, fontWeight: 600, color: '#0f172a',
                background: '#ffffff', border: 'none', borderRadius: 4,
                padding: '5px 12px', textDecoration: 'none', cursor: 'pointer',
                transition: 'background 0.15s', flexShrink: 0,
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
              onMouseOut={(e)  => { e.currentTarget.style.background = '#ffffff'; }}
            >
              {t('dash_upgrade')}
            </a>
          )}
          <a
            href="/friends"
            title={t('nav_friends')}
            style={{
              width: 34, height: 34, borderRadius: 4,
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
          <AvatarDropdown email={userEmail} displayName={userDisplayName} avatarUrl={userAvatarUrl} isVip={isVip} />
        </div>
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 60px' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
            {t('common_loading')}
          </div>
        )}

        {!loading && (
          <>
            {/* ── Continue studying banner ── */}
            {session && (
              <div style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '22px 28px', marginBottom: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.02em' }}>
                    {t('dash_continue')}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: lastDocName ? 4 : 0 }}>
                    {lastDocName ?? t('dash_last_session')}
                  </p>
                  {session.virtualIndex > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {t('dash_page')} {session.virtualIndex + 1}
                    </p>
                  )}
                </div>
                <a
                  href="/workspace"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    height: 42, padding: '0 22px', borderRadius: 4,
                    background: '#ffffff', color: '#0f172a',
                    textDecoration: 'none', fontSize: 13.5, fontWeight: 600, flexShrink: 0,
                    transition: 'background 0.13s',
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.88)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#ffffff'; }}
                >
                  <Play size={14} fill="currentColor" />
                  {t('dash_continue_btn')}
                </a>
              </div>
            )}

            {/* ── Stats ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 28 }}>
              <StatCard label={t('dash_stat_documents')} value={docs.length}      icon={<FileText size={20} />}     color="var(--accent)" />
              <StatCard label={t('dash_stat_voice')}     value={totalVoiceNotes}  icon={<Mic size={20} />}           color="#a78bfa" />
              <StatCard label={t('dash_stat_text')}      value={totalTextNotes}   icon={<MessageSquare size={20} />} color="#34d399" />
              <StatCard label={t('dash_stat_bookmarks')} value={totalBookmarks}   icon={<BookmarkIcon size={20} />}  color="#f59e0b" />
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, padding: '18px 20px' }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>🔥</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono), monospace' }}>
                  {studyStreak}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('dash_stat_streak')}</div>
              </div>
            </div>

            {/* ── Two-column section ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Recent Documents */}
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  padding: '15px 18px', borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{t('dash_recent')}</span>
                  <a
                    href="/workspace"
                    style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
                    onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
                  >
                    {t('dash_open_workspace')}
                  </a>
                </div>
                <div style={{ padding: '6px 8px', maxHeight: 340, overflowY: 'auto' }}>
                  {docs.length === 0 ? (
                    <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                        {t('dash_no_docs')}
                      </p>
                    </div>
                  ) : docs.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 10px', borderRadius: 4, marginBottom: 2, cursor: 'default',
                        transition: 'background 0.1s',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 4,
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
                            <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{t('lib_no_annotations')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Bookmarks */}
              <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{t('dash_quick_bookmarks')}</span>
                </div>
                <div style={{ padding: '6px 8px', maxHeight: 340, overflowY: 'auto' }}>
                  {allBookmarks.length === 0 ? (
                    <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                        {t('dash_no_bookmarks')}
                      </p>
                    </div>
                  ) : allBookmarks.map((bm) => (
                    <a
                      key={bm.id}
                      href="/workspace"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 10px', borderRadius: 4, marginBottom: 2,
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

            {/* ── Empty-state CTA ── */}
            {docs.length === 0 && !session && (
              <div style={{ marginTop: 40, textAlign: 'center', padding: '32px 24px' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 4, margin: '0 auto 20px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <BookOpen size={24} style={{ color: 'var(--text-2)' }} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>{t('dash_start_title')}</p>
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 22 }}>
                  {t('dash_start_desc')}
                </p>
                <a
                  href="/workspace"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    height: 42, padding: '0 22px', borderRadius: 4,
                    background: '#ffffff', color: '#0f172a', textDecoration: 'none',
                    fontSize: 13.5, fontWeight: 600, transition: 'background 0.13s',
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.88)'; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#ffffff'; }}
                >
                  <BookOpen size={14} />
                  {t('dash_open_workspace_btn')}
                </a>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
