'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Heart, MessageCircle, Share2, Bookmark, Trash2, Send,
  MoreHorizontal, FileText, PenLine, ChevronDown, ChevronUp,
  UserPlus, UserMinus, Users, Flame, Clock, X, CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchCommunityPosts, togglePostLike, addPostComment,
  deletePostComment, deleteCommunityPost,
  getFollowingIds, followUser, unfollowUser, createCommunityPost,
} from '@/lib/supabase/db';
import type { CommunityPost, CommunityFeedTab } from '@/lib/supabase/db';
import { useAuthGuard } from '@/hooks/useAuthGuard';

/**
 * Community page — Figma-matched redesign.
 *
 *   Header:  "Community" + subtitle               [ ✎ Create Post ]
 *   Tabs:    Trending  ·  Following  ·  Recent
 *   Feed:    Stacked post cards (avatar · author · time · … menu,
 *            title, body, tag pills, attachment sub-card, interaction
 *            row with like / comment / share / bookmark).
 *
 * Shared (app)/layout provides LeftRail + identity surface so this
 * page drops its inline header.
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
  return `${Math.floor(d / 30)}mo ago`;
}

// Hash-based tag color (mirrors Library so the same tag always gets the
// same colour across pages). Uses the existing 4 --note-{bg,text} pairs.
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

// Native share with clipboard fallback. Permalink is the community page;
// per-post deep links (e.g. /community/post/<id>) don't exist yet.
async function sharePost(post: CommunityPost): Promise<'shared' | 'copied' | 'failed'> {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/community` : '/community';
  const text = `Check out "${post.title || 'this post'}" on StudySync`;
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
        title: post.title || 'StudySync', text, url,
      });
      return 'shared';
    } catch { /* user cancelled or denied */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// ── Avatar (preserved from prior version) ────────────────────────────────────

function Avatar({ name, url, size = 36, isVip = false }: {
  name?: string | null; url?: string | null; size?: number; isVip?: boolean;
}) {
  const initial = (name ?? '?')[0]?.toUpperCase() ?? '?';
  const inner = (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: url ? 'transparent' : 'var(--accent)', color: '#fff',
      fontSize: size * 0.38, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
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

// ── Comment section ──────────────────────────────────────────────────────────

function CommentSection({
  post, myUserId, onAddComment, onDeleteComment,
}: {
  post: CommunityPost; myUserId: string | null;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    await onAddComment(post.id, trimmed);
    setText('');
    setSubmitting(false);
  };

  return (
    <div style={{
      marginTop: 12, paddingTop: 12,
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {post.comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {post.comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 9 }}>
              <Avatar name={c.username ?? c.userId} url={c.avatarUrl} size={26} isVip={c.isVip} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 6,
                  marginBottom: 2,
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>
                    {c.username ?? 'User'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {timeAgo(c.createdAt)}
                  </span>
                  {myUserId === c.userId && (
                    <button
                      onClick={() => onDeleteComment(post.id, c.id)}
                      title="Delete comment"
                      aria-label="Delete comment"
                      style={{
                        marginLeft: 'auto',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-3)', padding: 2, display: 'flex',
                      }}
                      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)'; }}
                      onMouseOut={(e)  => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
                <p style={{
                  margin: 0, fontSize: 12.5, color: 'var(--text-2)',
                  lineHeight: 1.5, wordBreak: 'break-word',
                }}>
                  {c.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {myUserId && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Write a comment…"
            disabled={submitting}
            style={{
              flex: 1, height: 32, padding: '0 12px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8, fontSize: 12.5, color: 'var(--text-1)',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            aria-label="Post comment"
            style={{
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: text.trim() ? 'var(--accent)' : 'var(--bg-active)',
              color: text.trim() ? '#fff' : 'var(--text-3)',
              border: 'none', cursor: text.trim() && !submitting ? 'pointer' : 'not-allowed',
            }}
          >
            <Send size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post, myUserId, isFollowing, isSaved,
  onLike, onSave, onAddComment, onDeleteComment,
  onDelete, onFollowToggle,
}: {
  post: CommunityPost; myUserId: string | null;
  isFollowing: boolean; isSaved: boolean;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onAddComment: (postId: string, content: string) => Promise<void>;
  onDeleteComment: (postId: string, commentId: string) => Promise<void>;
  onDelete: (id: string) => void;
  onFollowToggle: (userId: string, isFollowing: boolean) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [showAttachment, setShowAttachment] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwn = post.userId === myUserId;
  const hasAttachment =
    post.pages.length > 0 ||
    post.pages.some((p) => (p.textNotes && p.textNotes.length > 0) || p.canvasData);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const handleShare = async () => {
    const result = await sharePost(post);
    if (result === 'copied') setShareMsg('Link copied to clipboard');
    else if (result === 'failed') setShareMsg('Couldn’t share');
    // 'shared' = native sheet completed; no inline message needed
    if (result === 'copied' || result === 'failed') {
      setTimeout(() => setShareMsg(null), 2000);
    }
  };

  return (
    <article style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 12,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* ── Top row: avatar · name · time · … menu ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <a href={`/community/profile/${post.userId}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <Avatar name={post.username ?? post.userId} url={post.avatarUrl} size={38} isVip={post.isVip} />
        </a>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a
            href={`/community/profile/${post.userId}`}
            style={{
              fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
              textDecoration: 'none',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
            onMouseOut={(e)  => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
          >
            {post.username ?? 'User'}
          </a>
          <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>
            {timeAgo(post.createdAt)}
          </p>
        </div>

        {/* … menu — Follow/Unfollow (others) + Delete (own only) */}
        {myUserId && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="More"
              aria-label="More actions"
              style={{
                width: 30, height: 30, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: menuOpen ? 'var(--bg-hover)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: 'var(--text-3)',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
              onMouseOut={(e)  => { if (!menuOpen) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-3)' }); }}
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 40,
                minWidth: 180,
                background: 'var(--bg-float)',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid var(--bg-float-border)',
                boxShadow: 'var(--shadow-float)',
                borderRadius: 8, padding: 4,
              }}>
                {!isOwn && (
                  <button
                    onClick={() => { setMenuOpen(false); onFollowToggle(post.userId, isFollowing); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      height: 32, padding: '0 10px', borderRadius: 6,
                      background: 'transparent', border: 'none',
                      color: 'var(--text-1)', cursor: 'pointer',
                      fontSize: 12.5, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit',
                      transition: 'background 0.12s',
                    }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {isFollowing ? <UserMinus size={13} /> : <UserPlus size={13} />}
                    {isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                )}
                {isOwn && (
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(post.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      height: 32, padding: '0 10px', borderRadius: 6,
                      background: 'transparent', border: 'none',
                      color: 'var(--red)', cursor: 'pointer',
                      fontSize: 12.5, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit',
                      transition: 'background 0.12s',
                    }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--red-muted)'; }}
                    onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Trash2 size={13} />
                    Delete post
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Title ── */}
      {post.title && (
        <h3 style={{
          margin: 0, fontSize: 15.5, fontWeight: 700, color: 'var(--text-1)',
          lineHeight: 1.35,
        }}>
          {post.title}
        </h3>
      )}

      {/* ── Body ── */}
      {post.description && (
        <p style={{
          margin: 0, fontSize: 13.5, color: 'var(--text-2)',
          lineHeight: 1.55, wordBreak: 'break-word',
        }}>
          {post.description}
        </p>
      )}

      {/* ── Tag pills ── */}
      {post.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {post.tags.map((tag) => {
            const c = tagColor(tag);
            return (
              <span key={tag} style={{
                padding: '2px 8px', borderRadius: 4,
                fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
                background: c.bg, color: c.text,
              }}>
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Attachment sub-card ── */}
      {hasAttachment && (
        <div>
          <button
            onClick={() => setShowAttachment((v) => !v)}
            aria-expanded={showAttachment}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              color: 'var(--text-1)',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', borderColor: 'var(--border)' })}
            onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' })}
          >
            <span style={{
              width: 36, height: 36, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-muted)', color: 'var(--accent)',
              flexShrink: 0,
            }}>
              <FileText size={17} strokeWidth={1.8} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {post.title || 'Attachment'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>
                {post.pages.length} page{post.pages.length === 1 ? '' : 's'}
              </p>
            </div>
            {showAttachment ? <ChevronUp size={13} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-3)' }} />}
          </button>

          {showAttachment && (
            <div style={{
              marginTop: 8, padding: '12px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {post.pages.slice(0, 4).map((page, i) => (
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
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>Drawing attached</p>
                  )}
                </div>
              ))}
              {post.pages.length > 4 && (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
                  + {post.pages.length - 4} more page{post.pages.length - 4 === 1 ? '' : 's'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Footer interaction row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18,
        paddingTop: 4, marginTop: -2,
      }}>
        <FooterBtn
          active={post.likedByMe}
          activeColor="var(--red)"
          onClick={() => onLike(post.id)}
          title={post.likedByMe ? 'Unlike' : 'Like'}
        >
          <Heart size={15} fill={post.likedByMe ? 'currentColor' : 'none'} />
          {post.likesCount > 0 && <span>{post.likesCount}</span>}
        </FooterBtn>

        <FooterBtn
          active={showComments}
          activeColor="var(--accent)"
          onClick={() => setShowComments((v) => !v)}
          title="Comments"
        >
          <MessageCircle size={15} />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </FooterBtn>

        <FooterBtn
          onClick={handleShare}
          title="Share"
        >
          <Share2 size={14} />
          {shareMsg && (
            <span style={{ fontSize: 11.5, color: 'var(--text-2)', marginLeft: 4 }}>
              {shareMsg}
            </span>
          )}
        </FooterBtn>

        {myUserId && (
          <button
            onClick={() => onSave(post.id)}
            title={isSaved ? 'Remove bookmark' : 'Save post'}
            aria-label={isSaved ? 'Remove bookmark' : 'Save post'}
            style={{
              marginLeft: 'auto',
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6,
              color: isSaved ? 'var(--accent)' : 'var(--text-3)',
              transition: 'color 0.12s, background 0.12s',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {showComments && (
        <CommentSection
          post={post}
          myUserId={myUserId}
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
        />
      )}
    </article>
  );
}

function FooterBtn({
  active = false, activeColor, onClick, title, children,
}: {
  active?: boolean;
  activeColor?: string;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const color = active ? (activeColor ?? 'var(--accent)') : 'var(--text-3)';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 6px', borderRadius: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        color, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
        if (!active && activeColor) (e.currentTarget as HTMLElement).style.color = activeColor;
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
        (e.currentTarget as HTMLElement).style.color = color;
      }}
    >
      {children}
    </button>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

function CreatePostModal({ onClose, onPosted }: {
  onClose: () => void;
  onPosted: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !posting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, posting]);

  const addTag = useCallback(() => {
    const nextTag = tagInput.trim().replace(/^#/, '').replace(/,/g, '');
    if (!nextTag || tags.includes(nextTag) || tags.length >= 5) return;
    setTags((current) => [...current, nextTag]);
    setTagInput('');
  }, [tagInput, tags]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || posting) return;

    setPosting(true);
    setError(null);
    const postId = await createCommunityPost({
      documentId: null,
      title: title.trim(),
      description: description.trim(),
      pages: [],
      tags,
    });

    if (!postId) {
      setError('The post could not be created. Please try again.');
      setPosting(false);
      return;
    }

    setPosted(true);
    onPosted();
    window.setTimeout(onClose, 900);
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !posting) onClose();
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: 'rgba(15, 23, 42, 0.42)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-post-title"
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)',
          padding: 22,
        }}
      >
        {posted ? (
          <div style={{ textAlign: 'center', padding: '32px 12px' }}>
            <CheckCircle2 size={38} style={{ color: 'var(--green)', marginBottom: 12 }} />
            <h2 style={{ margin: '0 0 5px', fontSize: 18 }}>Post published</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
              Your post is now visible in the community.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <div>
                <h2 id="create-post-title" style={{ margin: 0, fontSize: 18, color: 'var(--text-1)' }}>
                  Create a post
                </h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-2)', fontSize: 12.5 }}>
                  Share a question, idea, or study tip with the community.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={posting}
                aria-label="Close create post dialog"
                style={{
                  display: 'flex', padding: 6, border: 0, borderRadius: 7,
                  background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{ display: 'block', marginBottom: 13 }}>
              <span style={{ display: 'block', marginBottom: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                Title
              </span>
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="What would you like to share?"
                style={{
                  width: '100%', height: 40, boxSizing: 'border-box', padding: '0 11px',
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--bg-elevated)', color: 'var(--text-1)',
                  font: 'inherit', fontSize: 13.5, outline: 'none',
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 13 }}>
              <span style={{ display: 'block', marginBottom: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                Description
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Add details to your post..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 11px', resize: 'vertical',
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--bg-elevated)', color: 'var(--text-1)',
                  font: 'inherit', fontSize: 13.5, lineHeight: 1.5, outline: 'none',
                }}
              />
            </label>

            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', marginBottom: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                Tags <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span>
              </span>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {tags.map((tag) => (
                    <span key={tag} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 8px', borderRadius: 999,
                      background: 'var(--accent-muted)', color: 'var(--accent)',
                      fontSize: 11.5, fontWeight: 600,
                    }}>
                      #{tag}
                      <button
                        type="button"
                        onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                        aria-label={`Remove ${tag} tag`}
                        style={{ padding: 0, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', lineHeight: 1 }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  disabled={tags.length >= 5}
                  placeholder={tags.length >= 5 ? 'Maximum 5 tags' : 'Add a tag'}
                  maxLength={50}
                  style={{
                    flex: 1, minWidth: 0, height: 36, padding: '0 10px',
                    border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--bg-elevated)', color: 'var(--text-1)',
                    font: 'inherit', fontSize: 12.5, outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={!tagInput.trim() || tags.length >= 5}
                  style={{
                    height: 36, padding: '0 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                    color: 'var(--text-2)', font: 'inherit', fontSize: 12.5,
                    cursor: tagInput.trim() && tags.length < 5 ? 'pointer' : 'default',
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" style={{ margin: '0 0 12px', color: 'var(--red, #dc2626)', fontSize: 12.5 }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={posting}
                style={{
                  height: 38, padding: '0 15px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-2)', font: 'inherit', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || posting}
                style={{
                  height: 38, padding: '0 17px', borderRadius: 8, border: 0,
                  background: title.trim() && !posting ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: title.trim() && !posting ? '#fff' : 'var(--text-3)',
                  font: 'inherit', fontSize: 13, fontWeight: 600,
                  cursor: title.trim() && !posting ? 'pointer' : 'default',
                }}
              >
                {posting ? 'Publishing...' : 'Publish post'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const SAVED_POSTS_KEY = 'community_saved_posts';

type Tab = 'trending' | 'following' | 'recent';
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType; serverTab: CommunityFeedTab }> = [
  { id: 'trending',  label: 'Trending',  icon: Flame,         serverTab: 'trending' },
  { id: 'following', label: 'Following', icon: Users,         serverTab: 'following' },
  { id: 'recent',    label: 'Recent',    icon: Clock,         serverTab: 'latest' },
];
// ── Main page ────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  useAuthGuard();

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('trending');
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [feedVersion, setFeedVersion] = useState(0);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(SAVED_POSTS_KEY) ?? '[]') as string[]); }
    catch { return new Set(); }
  });

  // Auth + follow graph
  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setMyUserId(user?.id ?? null);
      if (user?.id) {
        const ids = await getFollowingIds();
        setFollowingIds(new Set(ids));
      }
    });
  }, []);

  // Feed
  useEffect(() => {
    const followingArr = [...followingIds];
    const serverTab = TABS.find((t) => t.id === tab)?.serverTab ?? 'latest';
    fetchCommunityPosts({
      tab: serverTab,
      followingIds: tab === 'following' ? followingArr : undefined,
    }).then((data) => {
      setPosts(data);
      setLoading(false);
    });
  }, [tab, followingIds, feedVersion]);

  // Handlers
  const handleLike = useCallback(async (postId: string) => {
    if (!myUserId) return;
    const liked = await togglePostLike(postId);
    setPosts((prev) => prev.map((p) => p.id !== postId ? p : {
      ...p,
      likedByMe: liked,
      likesCount: liked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1),
    }));
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
      try { localStorage.setItem(SAVED_POSTS_KEY, JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  }, []);

  const handlePostCreated = useCallback(() => {
    setLoading(true);
    setTab('recent');
    setFeedVersion((version) => version + 1);
  }, []);

  const emptyCopy = useMemo(() => {
    if (tab === 'following') return {
      title: 'No posts from people you follow',
      body:  'Follow students to see their study notes here.',
    };
    if (tab === 'trending') return {
      title: 'No trending posts this week',
      body:  'Be the first to share — try Create Post.',
    };
    return {
      title: 'No posts yet',
      body:  'Be the first to share notes with the community.',
    };
  }, [tab]);

  return (
    <div style={{
      flex: 1, minHeight: '100vh',
      background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
    }}>
      <main style={{
        maxWidth: 760, margin: '0 auto',
        padding: '28px 24px 60px',
        display: 'flex', flexDirection: 'column', gap: 22,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em',
              color: 'var(--text-1)',
            }}>
              Community
            </h1>
            <p style={{
              margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-2)',
              lineHeight: 1.5, maxWidth: 520,
            }}>
              Discover notes, flashcards, and study guides from students worldwide.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreatePostOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 38, padding: '0 16px', borderRadius: 8,
              border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 600,
              textDecoration: 'none', fontFamily: 'inherit',
              flexShrink: 0,
              transition: 'background 0.13s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
            onMouseOut={(e)  => { e.currentTarget.style.background = 'var(--accent)'; }}
          >
            <PenLine size={14} /> Create Post
          </button>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          gap: 4, borderBottom: '1px solid var(--border-subtle)',
        }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setLoading(true);
                  setTab(id);
                }}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px',
                  background: 'transparent', border: 'none',
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'color 0.12s',
                }}
                onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseOut={(e)  => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
              >
                <Icon size={13} />
                {label}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 6, right: 6, bottom: -1,
                    height: 2, borderRadius: 1,
                    background: active ? 'var(--accent)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* ── Feed ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Loading…
          </div>
        ) : posts.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            background: 'var(--bg-panel)',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 12,
          }}>
            <Flame size={28} style={{ color: 'var(--text-3)', opacity: 0.5, marginBottom: 10 }} />
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              {emptyCopy.title}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {emptyCopy.body}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                myUserId={myUserId}
                isFollowing={followingIds.has(post.userId)}
                isSaved={savedPostIds.has(post.id)}
                onLike={handleLike}
                onSave={handleSavePost}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onDelete={handleDeletePost}
                onFollowToggle={handleFollowToggle}
              />
            ))}
          </div>
        )}
      </main>
      {createPostOpen && (
        <CreatePostModal
          onClose={() => setCreatePostOpen(false)}
          onPosted={handlePostCreated}
        />
      )}
    </div>
  );
}
