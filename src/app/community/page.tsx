'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Heart, MessageSquare, Users, Globe, Trash2, Send, ChevronDown, ChevronUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchCommunityPosts, togglePostLike, addPostComment,
  deletePostComment, deleteCommunityPost, getProfile, loadUserPreferences,
} from '@/lib/supabase/db';
import type { CommunityPost, CommunityComment } from '@/lib/supabase/db';
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
  return `${Math.floor(d / 30)}mo ago`;
}

function Avatar({ name, url, size = 32 }: { name?: string | null; url?: string | null; size?: number }) {
  const initial = (name ?? '?')[0]?.toUpperCase() ?? '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: url ? 'transparent' : 'var(--accent)', color: '#fff',
      fontSize: size * 0.38, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {url ? <img src={url} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
    </div>
  );
}

// ── Comment section ───────────────────────────────────────────────────────────

function CommentSection({ post, myUserId, onAddComment, onDeleteComment }: {
  post: CommunityPost;
  myUserId: string | null;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
}) {
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
              <Avatar name={c.username ?? c.userId} url={c.avatarUrl} size={26} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>
                    {c.username ?? 'User'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{timeAgo(c.createdAt)}</span>
                  {c.userId === myUserId && (
                    <button
                      onClick={() => onDeleteComment(post.id, c.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-3)', padding: 0, display: 'flex',
                        marginLeft: 'auto',
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>
                  {c.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {myUserId && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Write a comment…"
            disabled={submitting}
            style={{
              flex: 1, height: 32, padding: '0 10px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 12.5, color: 'var(--text-1)',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: text.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
              border: 'none', color: text.trim() ? '#fff' : 'var(--text-3)',
              cursor: text.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s, color 0.12s', flexShrink: 0,
            }}
          >
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({ post, myUserId, onLike, onAddComment, onDeleteComment, onDelete }: {
  post: CommunityPost;
  myUserId: string | null;
  onLike: (postId: string) => void;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onDelete: (postId: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);

  const hasContent = post.pages.some((p) =>
    (p.textNotes && p.textNotes.length > 0) || p.canvasData,
  );

  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '18px 20px 14px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Author row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={post.username ?? post.userId} url={post.avatarUrl} size={36} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
            {post.username ?? 'User'}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
            {timeAgo(post.createdAt)}
            {post.documentId && <> · from their library</>}
          </p>
        </div>
        {post.userId === myUserId && (
          <button
            onClick={() => onDelete(post.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', display: 'flex', padding: 4,
              borderRadius: 6, transition: 'color 0.12s',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Title & description */}
      {post.title && (
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
          {post.title}
        </h3>
      )}
      {post.description && (
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
          {post.description}
        </p>
      )}

      {/* Shared notes preview */}
      {hasContent && (
        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {post.pages.slice(0, 3).map((page, i) => (
            <div key={i}>
              {page.textNotes?.slice(0, 3).map((note, j) => (
                <p key={j} style={{
                  margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-1)',
                  lineHeight: 1.45, fontStyle: 'italic',
                  borderLeft: '2px solid var(--accent)', paddingLeft: 8,
                }}>
                  {note.content}
                </p>
              ))}
              {page.canvasData && (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
                  + drawing attached
                </p>
              )}
            </div>
          ))}
          {post.pages.length > 3 && (
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
              + {post.pages.length - 3} more page{post.pages.length - 3 !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={() => onLike(post.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12.5, fontWeight: 500, padding: 0, fontFamily: 'inherit',
            color: post.likedByMe ? '#ef4444' : 'var(--text-3)',
            transition: 'color 0.12s',
          }}
          onMouseOver={(e) => { if (!post.likedByMe) (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
          onMouseOut={(e) => { if (!post.likedByMe) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
        >
          <Heart size={14} fill={post.likedByMe ? 'currentColor' : 'none'} />
          {post.likesCount > 0 && post.likesCount}
        </button>

        <button
          onClick={() => setShowComments((s) => !s)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12.5, fontWeight: 500, padding: 0, fontFamily: 'inherit',
            color: showComments ? 'var(--accent)' : 'var(--text-3)',
            transition: 'color 0.12s',
          }}
        >
          <MessageSquare size={14} />
          {post.comments.length > 0 && post.comments.length}
          {showComments ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {showComments && (
        <CommentSection
          post={post}
          myUserId={myUserId}
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'latest' | 'top'>('latest');
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setMyUserId(user?.id ?? null);
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
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCommunityPosts(sort).then((data) => {
      setPosts(data);
      setLoading(false);
    });
  }, [sort]);

  const handleLike = useCallback(async (postId: string) => {
    if (!myUserId) return;
    const liked = await togglePostLike(postId);
    setPosts((prev) => prev.map((p) =>
      p.id !== postId ? p : {
        ...p,
        likedByMe: liked,
        likesCount: liked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1),
      },
    ));
  }, [myUserId]);

  const handleAddComment = useCallback(async (postId: string, content: string) => {
    const comment = await addPostComment(postId, content);
    if (!comment) return;
    setPosts((prev) => prev.map((p) =>
      p.id !== postId ? p : { ...p, comments: [...p.comments, comment] },
    ));
  }, []);

  const handleDeleteComment = useCallback(async (postId: string, commentId: string) => {
    await deletePostComment(commentId);
    setPosts((prev) => prev.map((p) =>
      p.id !== postId ? p : { ...p, comments: p.comments.filter((c) => c.id !== commentId) },
    ));
  }, []);

  const handleDeletePost = useCallback(async (postId: string) => {
    await deleteCommunityPost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const navLinks = [
    { label: 'Dashboard', href: '/dashboard', active: false },
    { label: 'Workspace', href: '/workspace', active: false },
    { label: 'Library', href: '/library', active: false },
    { label: 'Community', href: '/community', active: true },
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

      <main style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Page title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>
              <Globe size={20} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--accent)' }} />
              Community
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
              Notes and insights shared by students
            </p>
          </div>

          {/* Sort tabs */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
            {(['latest', 'top'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                style={{
                  height: 28, padding: '0 12px', borderRadius: 6,
                  background: sort === key ? 'var(--accent)' : 'transparent',
                  color: sort === key ? '#fff' : 'var(--text-2)',
                  border: 'none', fontSize: 12, fontWeight: sort === key ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s, color 0.12s',
                  textTransform: 'capitalize',
                }}
              >
                {key === 'latest' ? 'Latest' : 'Top'}
              </button>
            ))}
          </div>
        </div>

        {/* Share CTA */}
        <div style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
            Want to share your notes with the community?
          </p>
          <a
            href="/workspace"
            style={{
              flexShrink: 0, height: 34, padding: '0 14px',
              background: 'var(--accent)', color: '#fff',
              borderRadius: 8, fontSize: 12.5, fontWeight: 600,
              textDecoration: 'none', display: 'flex', alignItems: 'center',
            }}
          >
            Open Workspace
          </a>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Loading posts…
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)' }}>
            <Globe size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-2)' }}>
              No posts yet
            </p>
            <p style={{ fontSize: 13, margin: 0 }}>
              Be the first to share your study notes!
            </p>
          </div>
        )}

        {!loading && posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                myUserId={myUserId}
                onLike={handleLike}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onDelete={handleDeletePost}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
