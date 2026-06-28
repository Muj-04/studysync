'use client';
import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, UserPlus, X, Check, MessageCircle,
  MoreHorizontal, Users, Trash2,
} from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  searchUsers, sendFriendRequest, cancelFriendRequest, respondFriendRequest,
  removeFriend, getFriends, getFriendRequests, getMyFriendships, inviteToRoom,
  getUnreadMessageCounts, getMutualFriendCounts,
} from '@/lib/supabase/db';
import ChatPanel from '@/components/ChatPanel';
import type { UserResult, FriendEntry, FriendRequest, MyFriendship } from '@/lib/supabase/db';
import { useAuthGuard } from '@/hooks/useAuthGuard';

/**
 * Friends page — Figma-matched redesign.
 *
 *   ┌─ ACTIVE-ROOM BANNER (when in a study room) ──────────────────┐
 *   │ ADD FRIEND card                                               │
 *   │ ── FRIEND REQUESTS (when incoming/sent > 0) ──                │
 *   │ ── ALL FRIENDS — N · [Search friends…] ──                     │
 *   │ ┌──────────┐ ┌──────────┐                                     │
 *   │ │ friend   │ │ friend   │ … responsive grid                   │
 *   │ └──────────┘ └──────────┘                                     │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Shared (app)/layout provides LeftRail + identity surface so this
 * page drops the inline header it used to render.
 */

// ── UserAvatar (preserved) ───────────────────────────────────────────────────

function UserAvatar({ name, url, size = 36, isVip = false }: {
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

// ── Active room from localStorage (set by RoomClient) ────────────────────────

function getActiveRoom(): { roomId: string; roomName: string } | null {
  try {
    const raw = localStorage.getItem('activeRoom');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { roomId: string; roomName: string; timestamp: number };
    if (Date.now() - parsed.timestamp > 8 * 60 * 60 * 1000) {
      localStorage.removeItem('activeRoom');
      return null;
    }
    return { roomId: parsed.roomId, roomName: parsed.roomName };
  } catch { return null; }
}

// ── Search-result friendship status helper ────────────────────────────────────

type FsStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';
function getFsStatus(userId: string, friendships: MyFriendship[]): { status: FsStatus; friendshipId: string | null } {
  const fs = friendships.find((f) => f.otherUserId === userId);
  if (!fs) return { status: 'none', friendshipId: null };
  if (fs.status === 'accepted') return { status: 'accepted', friendshipId: fs.friendshipId };
  return { status: fs.isSender ? 'pending_sent' : 'pending_received', friendshipId: fs.friendshipId };
}

// ── ?openChat=<userId> deep-link consumer (Suspense-isolated) ────────────────

function OpenChatParamWatcher({
  friends, authReady, onOpen,
}: {
  friends:   FriendEntry[];
  authReady: boolean;
  onOpen:    (f: FriendEntry) => void;
}) {
  const searchParams = useSearchParams();
  const router       = useRouter();
  useEffect(() => {
    if (!authReady) return;
    const param = searchParams?.get('openChat');
    if (!param) return;
    if (!friends.length) return;
    const match = friends.find((f) => f.userId === param);
    if (match) onOpen(match);
    router.replace('/friends');
  }, [authReady, searchParams, friends, router, onOpen]);
  return null;
}

// ── Card shell ───────────────────────────────────────────────────────────────

function Card({ children, padding = 22 }: { children: React.ReactNode; padding?: number }) {
  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 12,
      padding,
    }}>
      {children}
    </div>
  );
}

// ── Add Friend card ──────────────────────────────────────────────────────────

function AddFriendCard({
  myFriendships, onSent,
}: {
  myFriendships: MyFriendship[];
  onSent: (receiverId: string, friendshipId: string) => void;
}) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [busyId, setBusyId]   = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced live search
  useEffect(() => {
    setError('');
    if (!query.trim()) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const r = await searchUsers(query);
      setResults(r);
      setLoading(false);
    }, 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const send = useCallback(async (receiverId: string) => {
    setBusyId(receiverId);
    const id = await sendFriendRequest(receiverId);
    setBusyId(null);
    if (id) {
      onSent(receiverId, id);
      setQuery('');
      setResults([]);
    } else {
      setError('Could not send request. They may have blocked requests or you already have one in flight.');
    }
  }, [onSent]);

  // "Add Friend" button = send-to-first-eligible-match
  const firstEligible = results.find((u) => {
    const fs = getFsStatus(u.id, myFriendships);
    return fs.status === 'none';
  });

  return (
    <Card>
      <h2 style={{
        margin: 0, fontSize: 18, fontWeight: 700,
        color: 'var(--text-1)', letterSpacing: '-0.01em',
      }}>
        Friends
      </h2>
      <p style={{
        margin: '4px 0 14px', fontSize: 13, color: 'var(--text-2)',
        lineHeight: 1.5,
      }}>
        Connect with classmates to share notes and study rooms.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <UserPlus size={14} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-3)', pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter username or invite code…"
            aria-label="Search users to add"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && firstEligible) { e.preventDefault(); void send(firstEligible.id); }
            }}
            style={{
              width: '100%', height: 40, paddingLeft: 36, paddingRight: 14,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8, fontSize: 13, color: 'var(--text-1)',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
        <button
          onClick={() => firstEligible && send(firstEligible.id)}
          disabled={!firstEligible || !!busyId}
          style={{
            height: 40, padding: '0 18px', borderRadius: 8,
            background: firstEligible ? 'var(--accent)' : 'var(--bg-active)',
            color: firstEligible ? '#fff' : 'var(--text-3)',
            border: 'none', fontSize: 13, fontWeight: 600,
            cursor: firstEligible && !busyId ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'background 0.13s',
          }}
          onMouseOver={(e) => { if (firstEligible) e.currentTarget.style.background = 'var(--accent-hover)'; }}
          onMouseOut={(e)  => { if (firstEligible) e.currentTarget.style.background = 'var(--accent)'; }}
        >
          <UserPlus size={14} /> Add Friend
        </button>
      </div>

      {/* Live search results dropdown */}
      {query.trim() && (
        <div style={{
          marginTop: 8, padding: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
        }}>
          {loading ? (
            <p style={{ margin: 0, padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p style={{ margin: 0, padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>
              No users match &quot;{query}&quot;.
            </p>
          ) : (
            results.map((u) => {
              const fs = getFsStatus(u.id, myFriendships);
              const display = u.username || u.email.split('@')[0] || 'User';
              return (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6,
                }}>
                  <UserAvatar name={display} url={u.avatarUrl} size={30} />
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontSize: 13, fontWeight: 500, color: 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {display}
                  </span>
                  {fs.status === 'accepted' && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500 }}>Already friends</span>
                  )}
                  {fs.status === 'pending_sent' && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500 }}>Request sent</span>
                  )}
                  {fs.status === 'pending_received' && (
                    <span style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>Sent you a request</span>
                  )}
                  {fs.status === 'none' && (
                    <button
                      onClick={() => send(u.id)}
                      disabled={busyId === u.id}
                      style={{
                        height: 28, padding: '0 12px', borderRadius: 6,
                        background: 'var(--accent)', color: '#fff', border: 'none',
                        fontSize: 12, fontWeight: 600,
                        cursor: busyId === u.id ? 'not-allowed' : 'pointer',
                        opacity: busyId === u.id ? 0.6 : 1,
                        fontFamily: 'inherit', flexShrink: 0,
                      }}
                    >
                      Add
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--red)' }}>{error}</p>
      )}
    </Card>
  );
}

// ── Friend Requests section ──────────────────────────────────────────────────

function RequestsSection({
  incoming, outgoing, mutualMap, busyId,
  onAccept, onReject, onCancel,
}: {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  mutualMap: Record<string, number>;
  busyId: string | null;
  onAccept: (friendshipId: string, otherUserId: string) => void;
  onReject: (friendshipId: string, otherUserId: string) => void;
  onCancel: (friendshipId: string, otherUserId: string) => void;
}) {
  if (incoming.length === 0 && outgoing.length === 0) return null;
  return (
    <div>
      <SectionHeader>
        <span>Friend Requests</span>
        <span style={{
          padding: '1px 8px', borderRadius: 9999,
          background: 'var(--accent)', color: '#fff',
          fontSize: 10.5, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {incoming.length + outgoing.length}
        </span>
      </SectionHeader>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {incoming.map((r) => {
          const display = r.username || 'Unknown user';
          const pending = busyId === r.userId;
          const mutuals = mutualMap[r.userId] ?? 0;
          return (
            <Card key={r.friendshipId} padding={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <UserAvatar name={display} url={r.avatarUrl} size={40} isVip={r.isVip} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {display}
                  </p>
                  <p style={{
                    margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)',
                  }}>
                    {mutuals > 0
                      ? `${mutuals} mutual friend${mutuals === 1 ? '' : 's'}`
                      : 'Wants to be friends'}
                  </p>
                </div>
                <button
                  onClick={() => onAccept(r.friendshipId, r.userId)}
                  disabled={pending}
                  title="Accept"
                  aria-label="Accept request"
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-muted)',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                    cursor: pending ? 'not-allowed' : 'pointer',
                    opacity: pending ? 0.6 : 1,
                    transition: 'background 0.12s',
                  }}
                  onMouseOver={(e) => { if (!pending) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 24%, transparent)'; }}
                  onMouseOut={(e)  => { if (!pending) e.currentTarget.style.background = 'var(--accent-muted)'; }}
                >
                  <Check size={16} strokeWidth={2.2} />
                </button>
                <button
                  onClick={() => onReject(r.friendshipId, r.userId)}
                  disabled={pending}
                  title="Reject"
                  aria-label="Reject request"
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-2)',
                    cursor: pending ? 'not-allowed' : 'pointer',
                    opacity: pending ? 0.6 : 1,
                    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                  }}
                  onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--red-muted)', color: 'var(--red)', borderColor: 'var(--red)' })}
                  onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'transparent',     color: 'var(--text-2)', borderColor: 'var(--border)' })}
                >
                  <X size={16} strokeWidth={2.2} />
                </button>
              </div>
            </Card>
          );
        })}

        {outgoing.length > 0 && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--bg-elevated)',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 10,
          }}>
            <p style={{
              margin: '0 0 8px', fontSize: 10.5, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-3)',
            }}>
              Sent · {outgoing.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {outgoing.map((r) => {
                const display = r.username || 'Unknown user';
                const pending = busyId === r.userId;
                return (
                  <div key={r.friendshipId} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <UserAvatar name={display} url={r.avatarUrl} size={26} />
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {display}
                    </span>
                    <button
                      onClick={() => onCancel(r.friendshipId, r.userId)}
                      disabled={pending}
                      style={{
                        height: 26, padding: '0 10px', borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--text-3)',
                        fontSize: 11.5, fontWeight: 500, cursor: pending ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', flexShrink: 0,
                        transition: 'color 0.12s, border-color 0.12s',
                      }}
                      onMouseOver={(e) => Object.assign(e.currentTarget.style, { color: 'var(--red)', borderColor: 'var(--red)' })}
                      onMouseOut={(e)  => Object.assign(e.currentTarget.style, { color: 'var(--text-3)', borderColor: 'var(--border)' })}
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: '0 0 12px', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color: 'var(--text-3)',
    }}>
      {children}
    </h3>
  );
}

// ── Friend card ──────────────────────────────────────────────────────────────

function FriendCard({
  f, unread, mutuals, activeRoom, inviteSent,
  onChat, onRemove, onInvite,
}: {
  f: FriendEntry;
  unread: number;
  mutuals: number;
  activeRoom: { roomId: string; roomName: string } | null;
  inviteSent: boolean;
  onChat: (f: FriendEntry) => void;
  onRemove: (friendshipId: string, otherUserId: string) => void;
  onInvite: (friendUserId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const display = f.username || 'Unknown user';

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  return (
    <Card padding={14}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <UserAvatar name={display} url={f.avatarUrl} size={42} isVip={f.isVip} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {display}
          </p>
          {mutuals > 0 && (
            <p style={{
              margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)',
            }}>
              {mutuals} mutual friend{mutuals === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {/* Chat button + unread badge */}
        <button
          onClick={() => onChat(f)}
          title="Open chat"
          aria-label={`Chat with ${display}${unread > 0 ? `, ${unread} unread` : ''}`}
          style={{
            position: 'relative',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 32, padding: '0 12px',
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            color: 'var(--accent)',
            cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 600,
            transition: 'background 0.12s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 22%, transparent)'; }}
          onMouseOut={(e)  => { e.currentTarget.style.background = 'var(--accent-muted)'; }}
        >
          <MessageCircle size={13} />
          Chat
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
              background: 'var(--red)', color: '#fff',
              fontSize: 10, fontWeight: 700, lineHeight: '18px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {/* … menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="More"
            aria-label="More actions"
            style={{
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: menuOpen ? 'var(--bg-hover)' : 'transparent',
              border: `1px solid ${menuOpen ? 'var(--border)' : 'var(--border-subtle)'}`,
              color: 'var(--text-2)', cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)' })}
            onMouseOut={(e)  => { if (!menuOpen) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)', borderColor: 'var(--border-subtle)' }); }}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 30,
              minWidth: 180,
              background: 'var(--bg-float)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--bg-float-border)',
              boxShadow: 'var(--shadow-float)',
              borderRadius: 8, padding: 4,
            }}>
              {activeRoom && (
                <button
                  onClick={() => { setMenuOpen(false); onInvite(f.userId); }}
                  disabled={inviteSent}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    height: 32, padding: '0 10px', borderRadius: 6,
                    background: 'transparent', border: 'none',
                    color: inviteSent ? 'var(--text-3)' : 'var(--text-1)',
                    cursor: inviteSent ? 'not-allowed' : 'pointer',
                    opacity: inviteSent ? 0.55 : 1,
                    fontSize: 12.5, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                  onMouseOver={(e) => { if (!inviteSent) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Users size={13} />
                  {inviteSent ? 'Invite sent' : `Invite to ${activeRoom.roomName}`}
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); onRemove(f.friendshipId, f.userId); }}
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
                Remove friend
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function FriendsPage() {
  useAuthGuard();
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [myUserId,  setMyUserId]  = useState<string | null>(null);

  const [friends,        setFriends]        = useState<FriendEntry[]>([]);
  const [incoming,       setIncoming]       = useState<FriendRequest[]>([]);
  const [outgoing,       setOutgoing]       = useState<FriendRequest[]>([]);
  const [myFriendships,  setMyFriendships]  = useState<MyFriendship[]>([]);
  const [mutualMap,      setMutualMap]      = useState<Record<string, number>>({});
  const [dataLoading,    setDataLoading]    = useState(true);

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [openChat,     setOpenChat]     = useState<FriendEntry | null>(null);

  const [busyId,    setBusyId]    = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());
  const [activeRoom, setActiveRoom] = useState<{ roomId: string; roomName: string } | null>(null);

  const [friendSearch, setFriendSearch] = useState('');

  // Auth
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return; }
      setMyUserId(user.id);
      setAuthReady(true);
    });
    setActiveRoom(getActiveRoom());
  }, [router]);

  // Initial data load (+ mutuals)
  const loadData = useCallback(async () => {
    setDataLoading(true);
    const [friendsList, requests, friendships] = await Promise.all([
      getFriends(),
      getFriendRequests(),
      getMyFriendships(),
    ]);
    setFriends(friendsList);
    setIncoming(requests.incoming);
    setOutgoing(requests.outgoing);
    setMyFriendships(friendships);
    setDataLoading(false);

    // Mutual counts — one batch for all friends + incoming-request users.
    const ids = [
      ...friendsList.map((f) => f.userId),
      ...requests.incoming.map((r) => r.userId),
    ];
    if (ids.length) {
      const counts = await getMutualFriendCounts(ids);
      setMutualMap(counts);
    } else {
      setMutualMap({});
    }
  }, []);

  useEffect(() => { if (authReady) loadData(); }, [authReady, loadData]);

  // Unread DM counts + realtime inbox
  useEffect(() => {
    if (!authReady || !myUserId) return;
    let cancelled = false;
    getUnreadMessageCounts().then((counts) => {
      if (!cancelled) setUnreadCounts(counts);
    });

    const sb = createClient();
    const channel: RealtimeChannel = sb
      .channel(`dm_inbox:${myUserId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'direct_messages',
          filter: `recipient_id=eq.${myUserId}`,
        },
        (payload) => {
          const r = payload.new as { sender_id: string };
          setUnreadCounts((prev) => ({
            ...prev,
            [r.sender_id]: (prev[r.sender_id] ?? 0) + 1,
          }));
        },
      )
      .subscribe();

    return () => { cancelled = true; channel.unsubscribe(); };
  }, [authReady, myUserId]);

  const handleConversationRead = useCallback((friendId: string) => {
    setUnreadCounts((prev) => {
      if (!prev[friendId]) return prev;
      const next = { ...prev }; delete next[friendId]; return next;
    });
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSent = useCallback((receiverId: string, friendshipId: string) => {
    setMyFriendships((prev) => [...prev, {
      friendshipId, otherUserId: receiverId, status: 'pending', isSender: true,
    }]);
    // Re-fetch outgoing requests so it shows in the SENT subsection
    void getFriendRequests().then((r) => setOutgoing(r.outgoing));
  }, []);

  const handleAccept = useCallback(async (friendshipId: string, otherUserId: string) => {
    setBusyId(otherUserId);
    await respondFriendRequest(friendshipId, 'accepted');
    const accepted = incoming.find((r) => r.friendshipId === friendshipId);
    setIncoming((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    if (accepted) {
      const newFriend: FriendEntry = {
        friendshipId, userId: accepted.userId,
        username: accepted.username, avatarUrl: accepted.avatarUrl, isVip: accepted.isVip,
      };
      setFriends((prev) => [...prev, newFriend]);
      setMyFriendships((prev) => prev.map((f) => f.friendshipId === friendshipId ? { ...f, status: 'accepted' } : f));
      // Refresh mutuals for the new friend
      void getMutualFriendCounts([accepted.userId]).then((c) =>
        setMutualMap((prev) => ({ ...prev, ...c })),
      );
    }
    setBusyId(null);
  }, [incoming]);

  const handleReject = useCallback(async (friendshipId: string, otherUserId: string) => {
    setBusyId(otherUserId);
    await respondFriendRequest(friendshipId, 'rejected');
    setIncoming((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    setMyFriendships((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setBusyId(null);
  }, []);

  const handleCancel = useCallback(async (friendshipId: string, otherUserId: string) => {
    setBusyId(otherUserId);
    await cancelFriendRequest(friendshipId);
    setMyFriendships((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setOutgoing((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    setBusyId(null);
  }, []);

  const handleRemoveFriend = useCallback(async (friendshipId: string, otherUserId: string) => {
    setBusyId(otherUserId);
    await removeFriend(friendshipId);
    setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setMyFriendships((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setBusyId(null);
  }, []);

  const handleInvite = useCallback(async (friendUserId: string) => {
    if (!activeRoom) return;
    await inviteToRoom(friendUserId, activeRoom.roomId, activeRoom.roomName);
    setInviteSent((prev) => new Set([...prev, friendUserId]));
  }, [activeRoom]);

  // Client-side filter for "All Friends" search
  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => (f.username ?? '').toLowerCase().includes(q));
  }, [friends, friendSearch]);

  if (!authReady) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-app)', minHeight: '100vh',
      }}>
        <span className="spinner" style={{
          width: 24, height: 24, borderRadius: '50%',
          border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)',
          display: 'block',
        }} />
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, minHeight: '100vh',
      background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
    }}>
      <main style={{
        maxWidth: 760, margin: '0 auto',
        padding: '28px 24px 60px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>

        {/* Active-room banner (slim) */}
        {activeRoom && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px',
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent)',
            borderRadius: 10,
            fontSize: 12.5, color: 'var(--accent)',
          }}>
            <Users size={13} style={{ flexShrink: 0 }} />
            <span>
              You&apos;re in <strong>{activeRoom.roomName}</strong> — invite friends from the … menu.
            </span>
          </div>
        )}

        {/* Add Friend card */}
        <AddFriendCard
          myFriendships={myFriendships}
          onSent={handleSent}
        />

        {/* Friend Requests */}
        {!dataLoading && (
          <RequestsSection
            incoming={incoming}
            outgoing={outgoing}
            mutualMap={mutualMap}
            busyId={busyId}
            onAccept={handleAccept}
            onReject={handleReject}
            onCancel={handleCancel}
          />
        )}

        {/* All Friends */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginBottom: 12, flexWrap: 'wrap',
          }}>
            <SectionHeader>
              <span>All Friends</span>
              <span style={{ color: 'var(--text-2)' }}>·</span>
              <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                {friends.length}
              </span>
            </SectionHeader>
            {friends.length > 0 && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Search size={12} style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-3)', pointerEvents: 'none',
                }} />
                <input
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Search friends…"
                  aria-label="Search your friends"
                  style={{
                    height: 30, paddingLeft: 28, paddingRight: 10,
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6, fontSize: 12, color: 'var(--text-1)',
                    outline: 'none', fontFamily: 'inherit',
                    width: 180,
                  }}
                />
              </div>
            )}
          </div>

          {dataLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <span className="spinner" style={{
                width: 20, height: 20, borderRadius: '50%',
                border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)',
              }} />
            </div>
          ) : friends.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 24px',
              background: 'var(--bg-panel)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 12,
            }}>
              <Users size={28} style={{ color: 'var(--text-3)', opacity: 0.45, marginBottom: 10 }} />
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                No friends yet
              </p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                Use the Add Friend field above to search by username.
              </p>
            </div>
          ) : filteredFriends.length === 0 ? (
            <p style={{
              textAlign: 'center', padding: '24px 0',
              fontSize: 12.5, color: 'var(--text-3)',
            }}>
              No friends match &quot;{friendSearch}&quot;.
            </p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 10,
            }}>
              {filteredFriends.map((f) => (
                <FriendCard
                  key={f.friendshipId}
                  f={f}
                  unread={unreadCounts[f.userId] ?? 0}
                  mutuals={mutualMap[f.userId] ?? 0}
                  activeRoom={activeRoom}
                  inviteSent={inviteSent.has(f.userId)}
                  onChat={setOpenChat}
                  onRemove={handleRemoveFriend}
                  onInvite={handleInvite}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ?openChat=<userId> deep-link */}
      <Suspense fallback={null}>
        <OpenChatParamWatcher
          friends={friends}
          authReady={authReady}
          onOpen={setOpenChat}
        />
      </Suspense>

      {openChat && myUserId && (
        <ChatPanel
          friendId={openChat.userId}
          friendName={openChat.username || 'Unknown user'}
          friendAvatar={openChat.avatarUrl}
          myUserId={myUserId}
          onClose={() => setOpenChat(null)}
          onConversationRead={handleConversationRead}
        />
      )}
    </div>
  );
}
