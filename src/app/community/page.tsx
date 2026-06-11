'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Heart, MessageSquare, Users, Globe, Trash2, Send, ChevronDown, ChevronUp,
  Search, UserPlus, UserMinus, Flame, Clock, TrendingUp, X, Bookmark,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchCommunityPosts, togglePostLike, addPostComment,
  deletePostComment, deleteCommunityPost, getProfile, loadUserPreferences,
  getFollowingIds, followUser, unfollowUser,
} from '@/lib/supabase/db';
import type { CommunityPost, CommunityFeedTab } from '@/lib/supabase/db';
import AvatarDropdown from '@/components/AvatarDropdown';
import NotificationBell from '@/components/NotificationBell';
import { applyPreferences } from '@/lib/preferences';
import { storageSet, KEYS } from '@/lib/storage';
import { useLanguage } from '@/contexts/LanguageContext';

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
  return `${Math.floor(d / 30)}mo ago`;
}

function Avatar({ name, url, size = 32, isVip = false }: { name?: string | null; url?: string | null; size?: number; isVip?: boolean }) {
  const initial = (name ?? '?')[0]?.toUpperCase() ?? '?';
  const inner = (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: url ? 'transparent' : 'var(--accent)', color: '#fff',
      fontSize: size * 0.38, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      position: isVip ? 'relative' : undefined, zIndex: isVip ? 1 : undefined,
    }}>
      {url ? <img src={url} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
    </div>
  );
  if (!isVip) return <div style={{ flexShrink: 0 }}>{inner}</div>;
  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
      <div style={{
        position: 'absolute', top: -2, left: -2, width: size + 4, height: size + 4, borderRadius: '50%',
        background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700, #FFA500)',
        backgroundSize: '200% 200%', animation: 'vip-shimmer 2.5s ease-in-out infinite',
      }} />
      {inner}
      <span style={{
        position: 'absolute', bottom: -3, right: -3, zIndex: 2,
        background: '#FFD700', color: '#000', fontWeight: 800,
        fontSize: Math.max(6, size * 0.2), padding: '1.5px 3.5px', borderRadius: 3,
        lineHeight: 1.3, letterSpacing: '0.03em',
        boxShadow: '0 1px 2px rgba(0,0,0,0.25)', pointerEvents: 'none',
      }}>VIP</span>
    </div>
  );
}

// ── Comment section ───────────────────────────────────────────────────────────

function CommentSection({ post, myUserId, onAddComment, onDeleteComment }: {
  post: CommunityPost; myUserId: string | null;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    await onAddComment(post.id, text.trim());
    setText('');
    setSubmitting(false);
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      {post.comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {post.comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 8 }}>
              <Avatar name={c.username ?? c.userId} url={c.avatarUrl} size={26} isVip={c.isVip} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <a href={`/community/profile/${c.userId}`} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', textDecoration: 'none' }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
                    onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
                  >{c.username ?? 'User'}</a>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{timeAgo(c.createdAt)}</span>
                  {c.userId === myUserId && (
                    <button onClick={() => onDeleteComment(post.id, c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', marginLeft: 'auto' }}>
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {myUserId && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={t('com_comment_placeholder')} disabled={submitting}
            style={{ flex: 1, height: 32, padding: '0 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12.5, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={handleSubmit} disabled={!text.trim() || submitting} style={{ width: 32, height: 32, borderRadius: 4, background: text.trim() ? 'var(--accent)' : 'var(--bg-elevated)', border: 'none', color: text.trim() ? '#fff' : 'var(--text-3)', cursor: text.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s, color 0.12s', flexShrink: 0 }}>
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({ post, myUserId, followingIds, savedPostIds, onLike, onSave, onAddComment, onDeleteComment, onDelete, onFollowToggle }: {
  post: CommunityPost; myUserId: string | null; followingIds: Set<string>; savedPostIds: Set<string>;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onDelete: (id: string) => void;
  onFollowToggle: (userId: string, isFollowing: boolean) => void;
}) {
  const { t } = useLanguage();
  const [showComments, setShowComments] = useState(false);
  const isFollowing = followingIds.has(post.userId);
  const isOwn = post.userId === myUserId;
  const isSaved = savedPostIds.has(post.id);

  const hasContent = post.pages.some((p) => (p.textNotes && p.textNotes.length > 0) || p.canvasData);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, padding: '18px 20px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <a href={`/community/profile/${post.userId}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <Avatar name={post.username ?? post.userId} url={post.avatarUrl} size={36} isVip={post.isVip} />
        </a>
        <div style={{ flex: 1 }}>
          <a href={`/community/profile/${post.userId}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textDecoration: 'none' }}
            onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
          >{post.username ?? 'User'}</a>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>{timeAgo(post.createdAt)}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {myUserId && !isOwn && (
            <button onClick={() => onFollowToggle(post.userId, isFollowing)} style={{
              height: 28, padding: '0 10px', borderRadius: 4,
              background: isFollowing ? 'var(--bg-elevated)' : 'var(--accent-muted)',
              color: isFollowing ? 'var(--text-3)' : 'var(--accent)',
              border: `1px solid ${isFollowing ? 'var(--border)' : 'transparent'}`,
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.12s',
            }}>
              {isFollowing ? <><UserMinus size={11} /> {t('com_following')}</> : <><UserPlus size={11} /> {t('com_follow')}</>}
            </button>
          )}
          {isOwn && (
            <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 4 }}
              onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
            ><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      {post.title && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{post.title}</h3>}
      {post.description && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{post.description}</p>}

      {post.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {post.tags.map((tag) => (
            <span key={tag} style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--accent-muted)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 500 }}>{tag}</span>
          ))}
        </div>
      )}

      {hasContent && (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {post.pages.slice(0, 3).map((page, i) => (
            <div key={i}>
              {page.textNotes?.slice(0, 3).map((note, j) => (
                <p key={j} style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.45, fontStyle: 'italic', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>{note.content}</p>
              ))}
              {page.canvasData && <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>{t('com_drawing_attached')}</p>}
            </div>
          ))}
          {post.pages.length > 3 && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
              + {post.pages.length - 3} {post.pages.length - 3 !== 1 ? t('com_more_pages') : t('com_more_page')}
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => onLike(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 500, padding: 0, fontFamily: 'inherit', color: post.likedByMe ? '#ef4444' : 'var(--text-3)', transition: 'color 0.12s' }}
          onMouseOver={(e) => { if (!post.likedByMe) (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
          onMouseOut={(e) => { if (!post.likedByMe) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
        >
          <Heart size={14} fill={post.likedByMe ? 'currentColor' : 'none'} />
          {post.likesCount > 0 && post.likesCount}
        </button>
        <button onClick={() => setShowComments((s) => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 500, padding: 0, fontFamily: 'inherit', color: showComments ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.12s' }}>
          <MessageSquare size={14} />
          {post.comments.length > 0 && post.comments.length}
          {showComments ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {myUserId && (
          <button onClick={() => onSave(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 500, padding: 0, marginLeft: 'auto', fontFamily: 'inherit', color: isSaved ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.12s' }}
            title={isSaved ? t('com_unsave_post') : t('com_save_post')}
          >
            <Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {showComments && <CommentSection post={post} myUserId={myUserId} onAddComment={onAddComment} onDeleteComment={onDeleteComment} />}
    </div>
  );
}

const COMMON_TAGS = ['Math', 'CS', 'Physics', 'Biology', 'Chemistry', 'History', 'Literature', 'Economics', 'Psychology', 'Law'];
const SAVED_POSTS_KEY = 'community_saved_posts';

type LocalTab = CommunityFeedTab | 'saved';

export default function CommunityPage() {
  const { t } = useLanguage();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<LocalTab>('latest');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(SAVED_POSTS_KEY) ?? '[]')); }
    catch { return new Set(); }
  });
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [isVip, setIsVip] = useState(false);

  const tabs: { id: LocalTab; label: string; icon: React.ReactNode }[] = [
    { id: 'latest', label: t('com_tab_latest'), icon: <Clock size={13} /> },
    { id: 'top', label: t('com_tab_top'), icon: <TrendingUp size={13} /> },
    { id: 'trending', label: t('com_tab_trending'), icon: <Flame size={13} /> },
    { id: 'following', label: t('com_tab_following'), icon: <Users size={13} /> },
    { id: 'saved', label: t('com_tab_saved'), icon: <Bookmark size={13} /> },
  ];

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setMyUserId(user?.id ?? null);
      setUserEmail(user?.email ?? '');
      const profile = await getProfile();
      setUserDisplayName(profile?.username ?? user?.email?.split('@')[0] ?? '');
      setUserAvatarUrl(profile?.avatarUrl ?? null);
      if (profile?.isVip) setIsVip(true);
      if (user?.id) {
        const ids = await getFollowingIds();
        setFollowingIds(new Set(ids));
      }
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
  }, []);

  useEffect(() => {
    setLoading(true);
    if (tab === 'saved') {
      const ids = [...savedPostIds];
      if (!ids.length) { setPosts([]); setLoading(false); return; }
      fetchCommunityPosts({ ids }).then((data) => { setPosts(data); setLoading(false); });
      return;
    }
    const followingArr = [...followingIds];
    fetchCommunityPosts({ tab: tab as CommunityFeedTab, tag: filterTag, followingIds: tab === 'following' ? followingArr : undefined }).then((data) => {
      setPosts(data);
      setLoading(false);
    });
  }, [tab, filterTag, followingIds, savedPostIds]);

  const handleLike = useCallback(async (postId: string) => {
    if (!myUserId) return;
    const liked = await togglePostLike(postId);
    setPosts((prev) => prev.map((p) => p.id !== postId ? p : { ...p, likedByMe: liked, likesCount: liked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1) }));
  }, [myUserId]);

  const handleAddComment = useCallback(async (postId: string, content: string) => {
    const comment = await addPostComment(postId, content);
    if (!comment) return;
    setPosts((prev) => prev.map((p) => p.id !== postId ? p : { ...p, comments: [...p.comments, comment] }));
  }, []);

  const handleDeleteComment = useCallback(async (postId: string, commentId: string) => {
    await deletePostComment(commentId);
    setPosts((prev) => prev.map((p) => p.id !== postId ? p : { ...p, comments: p.comments.filter((c) => c.id !== commentId) }));
  }, []);

  const handleDeletePost = useCallback(async (postId: string) => {
    await deleteCommunityPost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const handleFollowToggle = useCallback(async (userId: string, isCurrentlyFollowing: boolean) => {
    if (isCurrentlyFollowing) {
      await unfollowUser(userId);
      setFollowingIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    } else {
      await followUser(userId);
      setFollowingIds((prev) => new Set([...prev, userId]));
    }
  }, []);

  const handleSavePost = useCallback((postId: string) => {
    setSavedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      localStorage.setItem(SAVED_POSTS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const visiblePosts = posts.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.username ?? '').toLowerCase().includes(q) || p.tags.some((tag) => tag.toLowerCase().includes(q));
  });

  const navLinks = [
    { label: t('nav_dashboard'), href: '/dashboard', active: false },
    { label: t('nav_workspace'), href: '/workspace', active: false },
    { label: t('nav_library'), href: '/library', active: false },
    { label: t('nav_community'), href: '/community', active: true },
    { label: t('nav_settings'), href: '/settings', active: false },
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

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px 60px' }}>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>
            <Globe size={20} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent)' }} />
            {t('com_title')}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>{t('com_subtitle')}</p>
        </div>

        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('com_search_placeholder')} style={{ width: '100%', height: 40, paddingLeft: 36, paddingRight: search ? 36 : 12, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, padding: 4, marginBottom: 16 }}>
          {tabs.map(({ id, label, icon }) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, height: 32, borderRadius: 4, background: tab === id ? 'var(--accent)' : 'transparent', color: tab === id ? '#fff' : 'var(--text-2)', border: 'none', fontSize: 12.5, fontWeight: tab === id ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'background 0.12s, color 0.12s' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {COMMON_TAGS.map((tag) => (
            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)} style={{ padding: '4px 10px', borderRadius: 4, background: filterTag === tag ? 'var(--accent)' : 'var(--bg-panel)', color: filterTag === tag ? '#fff' : 'var(--text-2)', border: `1px solid ${filterTag === tag ? 'var(--accent)' : 'var(--border)'}`, fontSize: 11.5, fontWeight: filterTag === tag ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
              {tag}
            </button>
          ))}
          {filterTag && !COMMON_TAGS.includes(filterTag) && (
            <span style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 11.5, fontWeight: 600 }}>{filterTag}</span>
          )}
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>{t('com_share_cta')}</p>
          <a href="/workspace" style={{ flexShrink: 0, height: 34, padding: '0 14px', background: '#ffffff', color: '#0f172a', borderRadius: 4, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            {t('com_open_workspace')}
          </a>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>{t('com_loading')}</div>}

        {!loading && visiblePosts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)' }}>
            {tab === 'saved' ? <Bookmark size={36} style={{ opacity: 0.25, marginBottom: 12 }} /> : <Globe size={36} style={{ opacity: 0.25, marginBottom: 12 }} />}
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-2)' }}>
              {tab === 'saved' ? t('com_no_saved') : tab === 'following' ? t('com_no_following') : search ? t('com_no_search') : t('com_no_posts_yet')}
            </p>
            <p style={{ fontSize: 13, margin: 0 }}>
              {tab === 'saved' ? t('com_no_saved_hint') : tab === 'following' ? t('com_no_following_hint') : t('com_no_posts')}
            </p>
          </div>
        )}

        {!loading && visiblePosts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {visiblePosts.map((post) => (
              <PostCard
                key={post.id} post={post} myUserId={myUserId} followingIds={followingIds} savedPostIds={savedPostIds}
                onLike={handleLike} onSave={handleSavePost} onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment} onDelete={handleDeletePost}
                onFollowToggle={handleFollowToggle}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
