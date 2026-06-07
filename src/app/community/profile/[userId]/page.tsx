'use client';
import { useEffect, useState, useCallback, use } from 'react';
import { ArrowLeft, Heart, MessageSquare, Users, UserPlus, UserMinus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  getPublicProfile, getUserCommunityPosts,
  followUser, unfollowUser, togglePostLike, addPostComment, deletePostComment, deleteCommunityPost,
  getProfile, loadUserPreferences,
} from '@/lib/supabase/db';
import type { PublicProfile, CommunityPost, CommunityComment } from '@/lib/supabase/db';
import AvatarDropdown from '@/components/AvatarDropdown';
import NotificationBell from '@/components/NotificationBell';
import { applyPreferences } from '@/lib/preferences';
import { storageSet, KEYS } from '@/lib/storage';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ name, url, size = 32 }: { name?: string | null; url?: string | null; size?: number }) {
  const initial = (name ?? '?')[0]?.toUpperCase() ?? '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: url ? 'transparent' : 'var(--accent)', color: '#fff',
      fontSize: size * 0.38, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {url ? <img src={url} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
    </div>
  );
}

function MiniPostCard({ post, myUserId, onLike, onDelete }: {
  post: CommunityPost; myUserId: string | null;
  onLike: (id: string) => void; onDelete: (id: string) => void;
}) {
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {post.title && (
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)' }}>{post.title}</h3>
      )}
      {post.description && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{post.description}</p>
      )}
      {post.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {post.tags.map((tag) => (
            <span key={tag} style={{
              padding: '2px 8px', borderRadius: 20,
              background: 'var(--accent-muted)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 500,
            }}>{tag}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => onLike(post.id)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12.5, color: post.likedByMe ? '#ef4444' : 'var(--text-3)', padding: 0, fontFamily: 'inherit',
        }}>
          <Heart size={13} fill={post.likedByMe ? 'currentColor' : 'none'} />
          {post.likesCount || ''}
        </button>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MessageSquare size={13} /> {post.comments.length || ''}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 'auto' }}>{timeAgo(post.createdAt)}</span>
        {post.userId === myUserId && (
          <button onClick={() => onDelete(post.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11.5, color: '#ef4444', padding: 0, fontFamily: 'inherit',
          }}>Delete</button>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId: targetId } = use(params);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState('');
  const [myDisplayName, setMyDisplayName] = useState('');
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [followPending, setFollowPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setMyUserId(user?.id ?? null);
      setMyEmail(user?.email ?? '');
      const p = await getProfile();
      setMyDisplayName(p?.username ?? user?.email?.split('@')[0] ?? '');
      setMyAvatarUrl(p?.avatarUrl ?? null);
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

    Promise.all([getPublicProfile(targetId), getUserCommunityPosts(targetId)]).then(([prof, userPosts]) => {
      setProfile(prof);
      setPosts(userPosts);
      setLoading(false);
    });
  }, [targetId]);

  const handleFollow = useCallback(async () => {
    if (!profile || followPending) return;
    setFollowPending(true);
    if (profile.isFollowedByMe) {
      await unfollowUser(targetId);
      setProfile((p) => p ? { ...p, isFollowedByMe: false, followersCount: Math.max(0, p.followersCount - 1) } : p);
    } else {
      await followUser(targetId);
      setProfile((p) => p ? { ...p, isFollowedByMe: true, followersCount: p.followersCount + 1 } : p);
    }
    setFollowPending(false);
  }, [profile, followPending, targetId]);

  const handleLike = useCallback(async (postId: string) => {
    if (!myUserId) return;
    const liked = await togglePostLike(postId);
    setPosts((prev) => prev.map((p) => p.id !== postId ? p : {
      ...p, likedByMe: liked, likesCount: liked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1),
    }));
  }, [myUserId]);

  const handleDelete = useCallback(async (postId: string) => {
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
      <header style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-app)', position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>StudySync</span>
          <nav style={{ display: 'flex', gap: 2 }}>
            {navLinks.map(({ label, href, active }) => (
              <a key={label} href={href} style={{
                fontSize: 13, fontWeight: 400,
                color: active ? 'var(--accent)' : 'var(--text-2)',
                textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
                borderBottom: active ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                transition: 'color 0.15s',
              }}
                onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
                onMouseOut={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)'; }}
              >{label}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/friends" title="Friends" style={{
            width: 34, height: 34, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-2)', textDecoration: 'none', transition: 'background 0.12s, color 0.12s',
          }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' })}
          ><Users size={16} /></a>
          <NotificationBell />
          <AvatarDropdown email={myEmail} displayName={myDisplayName} avatarUrl={myAvatarUrl} />
        </div>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 60px' }}>
        <a href="/community" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 28,
          transition: 'color 0.12s',
        }}
          onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Back to Community
        </a>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
        )}

        {!loading && profile && (
          <>
            {/* Profile header */}
            <div style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 16, padding: '28px', marginBottom: 28,
              display: 'flex', alignItems: 'flex-start', gap: 20,
            }}>
              <Avatar name={profile.username ?? profile.userId} url={profile.avatarUrl} size={72} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>
                    {profile.username ?? 'User'}
                  </h1>
                  {myUserId && myUserId !== targetId && (
                    <button
                      onClick={handleFollow}
                      disabled={followPending}
                      style={{
                        height: 34, padding: '0 16px', borderRadius: 8,
                        background: profile.isFollowedByMe ? 'var(--bg-elevated)' : 'var(--accent)',
                        color: profile.isFollowedByMe ? 'var(--text-2)' : '#fff',
                        border: profile.isFollowedByMe ? '1px solid var(--border)' : 'none',
                        fontSize: 12.5, fontWeight: 600, cursor: followPending ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'background 0.12s, color 0.12s',
                      }}
                    >
                      {profile.isFollowedByMe ? <><UserMinus size={13} /> Unfollow</> : <><UserPlus size={13} /> Follow</>}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{posts.length}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>Posts</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{profile.followersCount}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>Followers</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{profile.followingCount}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>Following</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Posts */}
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
              Posts
            </h2>
            {posts.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '40px 0' }}>
                No posts yet
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {posts.map((p) => (
                  <MiniPostCard
                    key={p.id} post={p} myUserId={myUserId}
                    onLike={handleLike} onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {!loading && !profile && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: '60px 0' }}>User not found.</p>
        )}
      </main>
    </div>
  );
}
