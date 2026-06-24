'use client';
import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, Search, UserPlus, UserCheck, UserMinus,
  Users, Clock, X, Check, MessageSquare,
} from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  searchUsers, sendFriendRequest, cancelFriendRequest, respondFriendRequest,
  removeFriend, getFriends, getFriendRequests, getMyFriendships, inviteToRoom,
  getProfile,
  getUnreadMessageCounts,
} from '@/lib/supabase/db';
import ChatPanel from '@/components/ChatPanel';
import type { UserResult, FriendEntry, FriendRequest, MyFriendship } from '@/lib/supabase/db';
import AvatarDropdown from '@/components/AvatarDropdown';
import NotificationBell from '@/components/NotificationBell';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthGuard } from '@/hooks/useAuthGuard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function UserAvatar({ name, url, size = 36, isVip = false }: { name?: string | null; url?: string | null; size?: number; isVip?: boolean }) {
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

type Tab = 'friends' | 'requests';

// ── Friendship status in search results ───────────────────────────────────────
type FsStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

function getFsStatus(userId: string, friendships: MyFriendship[]): { status: FsStatus; friendshipId: string | null } {
  const fs = friendships.find((f) => f.otherUserId === userId);
  if (!fs) return { status: 'none', friendshipId: null };
  if (fs.status === 'accepted') return { status: 'accepted', friendshipId: fs.friendshipId };
  return { status: fs.isSender ? 'pending_sent' : 'pending_received', friendshipId: fs.friendshipId };
}

// ── Active room from localStorage (set by RoomClient) ─────────────────────────
function getActiveRoom(): { roomId: string; roomName: string } | null {
  try {
    const raw = localStorage.getItem('activeRoom');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { roomId: string; roomName: string; timestamp: number };
    if (Date.now() - parsed.timestamp > 8 * 60 * 60 * 1000) { localStorage.removeItem('activeRoom'); return null; }
    return { roomId: parsed.roomId, roomName: parsed.roomName };
  } catch { return null; }
}

// ── Small shared UI ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <span className="spinner" style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', display: 'block' }} />
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
      <Icon size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
      <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>{title}</p>
      <p style={{ margin: 0, fontSize: 13 }}>{sub}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// useSearchParams() requires a Suspense boundary above it under Next.js's
// CSR-bailout rules — wrapping the whole FriendsPage would defeat the
// point, so we isolate the only param-dependent logic (the
// ?openChat=<friendUserId> deep-link from NotificationBell) into this
// tiny child component and mount it under <Suspense fallback={null} />.
// Renders nothing; pure side effect.
function OpenChatParamWatcher({
  friends, authReady, onOpen,
}: {
  friends:    FriendEntry[];
  authReady:  boolean;
  onOpen:     (f: FriendEntry) => void;
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

export default function FriendsPage() {
  useAuthGuard();
  const router = useRouter();
  const { t } = useLanguage();
  const [userEmail, setUserEmail]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl]     = useState<string | null>(null);
  const [isVip, setIsVip]             = useState(false);
  const [authReady, setAuthReady]     = useState(false);

  const [tab, setTab]             = useState<Tab>('friends');
  const [query, setQuery]         = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [friends, setFriends]         = useState<FriendEntry[]>([]);
  const [incoming, setIncoming]       = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing]       = useState<FriendRequest[]>([]);
  const [myFriendships, setMyFriendships] = useState<MyFriendship[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [actionPending, setActionPending] = useState<string | null>(null);
  const [inviteSent, setInviteSent]   = useState<Set<string>>(new Set());
  const [activeRoom, setActiveRoom]   = useState<{ roomId: string; roomName: string } | null>(null);

  // ── Direct-message state ──────────────────────────────────────────────────
  // myUserId is captured separately from auth so the chat subscription can
  // filter postgres_changes by recipient_id without re-querying getUser().
  const [myUserId, setMyUserId]         = useState<string | null>(null);
  const [openChat, setOpenChat]         = useState<FriendEntry | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth + initial data load
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/login'); return; }
      setMyUserId(user.id);
      setUserEmail(user.email ?? '');
      const profile = await getProfile();
      setDisplayName(profile?.username ?? user.email?.split('@')[0] ?? '');
      setAvatarUrl(profile?.avatarUrl ?? null);
      if (profile?.isVip) setIsVip(true);
      setAuthReady(true);
    });

    setActiveRoom(getActiveRoom());
  }, [router]);

  // Load friends data
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
  }, []);

  useEffect(() => { if (authReady) loadData(); }, [authReady, loadData]);

  // ?openChat=<friendUserId> deep-link is consumed by
  // <OpenChatParamWatcher /> below, wrapped in <Suspense> so Next.js's
  // CSR-bailout rule on useSearchParams() doesn't break the build.

  // ── Direct-message unread counts + realtime inbox subscription ─────────────
  // Initial counts come from getUnreadMessageCounts(). After that, a single
  // postgres_changes subscription on direct_messages INSERT filtered to
  // `recipient_id = me` increments the count for each new message's sender.
  // The open ChatPanel calls back into onConversationRead to clear that
  // friend's count when its messages are marked read. Pattern mirrors the
  // postgres_changes subscription in useStudyRoom (room_members DELETE) —
  // separate channel, no shared state with the study-room flow.
  useEffect(() => {
    if (!authReady || !myUserId) return;
    let cancelled = false;
    getUnreadMessageCounts().then((counts) => {
      if (!cancelled) setUnreadCounts(counts);
    });

    const supabase = createClient();
    const channel: RealtimeChannel = supabase
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

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
  }, [authReady, myUserId]);

  const handleConversationRead = useCallback((friendId: string) => {
    setUnreadCounts((prev) => {
      if (!prev[friendId]) return prev;
      const next = { ...prev };
      delete next[friendId];
      return next;
    });
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchUsers(query);
      setSearchResults(results);
      setSearchLoading(false);
    }, 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSendRequest = useCallback(async (receiverId: string) => {
    setActionPending(receiverId);
    const id = await sendFriendRequest(receiverId);
    if (id) {
      setMyFriendships((prev) => [...prev, { friendshipId: id, otherUserId: receiverId, status: 'pending', isSender: true }]);
    }
    setActionPending(null);
  }, []);

  const handleCancelRequest = useCallback(async (friendshipId: string, otherUserId: string) => {
    setActionPending(otherUserId);
    await cancelFriendRequest(friendshipId);
    setMyFriendships((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setOutgoing((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    setActionPending(null);
  }, []);

  const handleAccept = useCallback(async (friendshipId: string, otherUserId: string) => {
    setActionPending(otherUserId);
    await respondFriendRequest(friendshipId, 'accepted');
    const accepted = incoming.find((r) => r.friendshipId === friendshipId);
    setIncoming((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    if (accepted) {
      setFriends((prev) => [...prev, { friendshipId, userId: accepted.userId, username: accepted.username, avatarUrl: accepted.avatarUrl, isVip: accepted.isVip }]);
      setMyFriendships((prev) => prev.map((f) => f.friendshipId === friendshipId ? { ...f, status: 'accepted' } : f));
    }
    setActionPending(null);
  }, [incoming]);

  const handleReject = useCallback(async (friendshipId: string, otherUserId: string) => {
    setActionPending(otherUserId);
    await respondFriendRequest(friendshipId, 'rejected');
    setIncoming((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    setMyFriendships((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setActionPending(null);
  }, []);

  const handleRemoveFriend = useCallback(async (friendshipId: string, otherUserId: string) => {
    setActionPending(otherUserId);
    await removeFriend(friendshipId);
    setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setMyFriendships((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setActionPending(null);
  }, []);

  const handleInvite = useCallback(async (friendUserId: string) => {
    if (!activeRoom) return;
    await inviteToRoom(friendUserId, activeRoom.roomId, activeRoom.roomName);
    setInviteSent((prev) => new Set([...prev, friendUserId]));
  }, [activeRoom]);

  // ── Shared button styles ──────────────────────────────────────────────────

  const primaryBtnStyle: React.CSSProperties = {
    height: 30, padding: '0 12px', borderRadius: 4, border: 'none',
    background: '#ffffff', color: '#0f172a', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
    transition: 'background 0.12s', whiteSpace: 'nowrap', flexShrink: 0,
  };
  const ghostBtnStyle: React.CSSProperties = {
    height: 30, padding: '0 12px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'var(--bg-elevated)', color: 'var(--text-2)', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
    transition: 'background 0.12s, color 0.12s', whiteSpace: 'nowrap', flexShrink: 0,
  };
  const dangerBtnStyle: React.CSSProperties = {
    ...ghostBtnStyle,
    color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)',
  };

  // ── User card for search results ──────────────────────────────────────────

  function SearchCard({ u }: { u: UserResult }) {
    const { status, friendshipId } = getFsStatus(u.id, myFriendships);
    const isPending = actionPending === u.id;
    const displayN = u.username || u.email.split('@')[0];

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <UserAvatar name={u.username ?? u.email} url={u.avatarUrl} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayN}
          </p>
        </div>
        {status === 'none' && (
          <button onClick={() => handleSendRequest(u.id)} disabled={isPending} style={{ ...primaryBtnStyle, opacity: isPending ? 0.6 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}>
            <UserPlus size={12} /> {t('fr_add_friend')}
          </button>
        )}
        {status === 'pending_sent' && (
          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> {t('fr_pending')}
          </span>
        )}
        {status === 'pending_received' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => handleAccept(friendshipId!, u.id)} disabled={isPending} style={{ ...primaryBtnStyle, opacity: isPending ? 0.6 : 1 }}>
              <Check size={12} /> {t('fr_accept')}
            </button>
            <button onClick={() => handleReject(friendshipId!, u.id)} disabled={isPending} style={{ ...ghostBtnStyle, opacity: isPending ? 0.6 : 1 }}>
              <X size={12} /> {t('fr_reject')}
            </button>
          </div>
        )}
        {status === 'accepted' && (
          <span style={{ fontSize: 12, color: 'var(--accent)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            <UserCheck size={12} /> {t('fr_is_friend')}
          </span>
        )}
      </div>
    );
  }

  // ── Friend card ───────────────────────────────────────────────────────────

  function FriendCard({ f }: { f: FriendEntry }) {
    const isPending = actionPending === f.userId;
    const sent = inviteSent.has(f.userId);
    const displayN = f.username || 'Unknown user';
    const unread = unreadCounts[f.userId] ?? 0;

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <UserAvatar name={f.username} url={f.avatarUrl} size={38} isVip={f.isVip} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayN}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setOpenChat(f)}
            title="Chat"
            aria-label={`Chat with ${displayN}${unread > 0 ? `, ${unread} unread` : ''}`}
            style={{
              ...ghostBtnStyle,
              position: 'relative',
              paddingRight: unread > 0 ? 22 : 12,
            }}
          >
            <MessageSquare size={12} /> Chat
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 9999,
                background: '#ef4444', color: '#fff',
                fontSize: 9.5, fontWeight: 700, lineHeight: '16px',
                textAlign: 'center',
                boxShadow: '0 0 0 2px var(--bg-app)',
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          {activeRoom && (
            <button
              onClick={() => handleInvite(f.userId)}
              disabled={sent}
              title={sent ? t('fr_invite_sent') : `${t('fr_invite_to')} ${activeRoom.roomName}`}
              style={{
                ...ghostBtnStyle,
                color: sent ? 'var(--accent)' : 'var(--text-2)',
                opacity: sent ? 0.7 : 1,
                cursor: sent ? 'default' : 'pointer',
              }}
            >
              {sent ? <><UserCheck size={12} /> {t('fr_invited')}</> : <><Users size={12} /> {t('fr_invite_room')}</>}
            </button>
          )}
          <button
            onClick={() => handleRemoveFriend(f.friendshipId, f.userId)}
            disabled={isPending}
            style={{ ...dangerBtnStyle, opacity: isPending ? 0.6 : 1 }}
          >
            <UserMinus size={12} /> {t('fr_remove')}
          </button>
        </div>
      </div>
    );
  }

  // ── Request card ──────────────────────────────────────────────────────────

  function RequestCard({ r, direction }: { r: FriendRequest; direction: 'incoming' | 'outgoing' }) {
    const isPending = actionPending === r.userId;
    const displayN = r.username || 'Unknown user';

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <UserAvatar name={r.username} url={r.avatarUrl} size={38} isVip={r.isVip} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{displayN}</p>
          <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>
            {direction === 'incoming' ? t('fr_sent_request') : t('fr_request_pending')}
          </p>
        </div>
        {direction === 'incoming' ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => handleAccept(r.friendshipId, r.userId)} disabled={isPending} style={{ ...primaryBtnStyle, opacity: isPending ? 0.6 : 1 }}>
              <Check size={12} /> {t('fr_accept')}
            </button>
            <button onClick={() => handleReject(r.friendshipId, r.userId)} disabled={isPending} style={{ ...ghostBtnStyle, opacity: isPending ? 0.6 : 1 }}>
              <X size={12} /> {t('fr_reject')}
            </button>
          </div>
        ) : (
          <button onClick={() => handleCancelRequest(r.friendshipId, r.userId)} disabled={isPending} style={{ ...dangerBtnStyle, opacity: isPending ? 0.6 : 1 }}>
            {t('fr_cancel')}
          </button>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!authReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg-app)' }}>
        <span className="spinner" style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', display: 'block' }} />
      </div>
    );
  }

  const requestCount = incoming.length + outgoing.length;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit' }}>
      {/* ── Header ── */}
      <div style={{
        height: 52, borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14,
        background: 'var(--bg-panel)',
      }}>
        <a
          href="/workspace"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 500, color: 'var(--text-3)',
            textDecoration: 'none', transition: 'color 0.13s', flexShrink: 0,
          }}
          onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-3)'; }}
        >
          <ChevronLeft size={14} /> {t('fr_back_workspace')}
        </a>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', flex: 1 }}>
          {t('fr_title')}
        </span>
        <NotificationBell />
        <AvatarDropdown email={userEmail} displayName={displayName} avatarUrl={avatarUrl} isVip={isVip} />
      </div>

      {/* ── Active room banner ── */}
      {activeRoom && (
        <div style={{
          background: 'var(--accent-muted)', borderBottom: '1px solid rgba(37,99,235,0.2)',
          padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12.5, color: 'var(--accent)',
        }}>
          <Users size={13} />
          <span>{t('fr_in_room')} <strong>{activeRoom.roomName}</strong> {t('fr_active_room_hint')}</span>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px' }}>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <Search size={14} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-3)', pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('fr_search_placeholder')}
            className="app-input"
            style={{
              width: '100%', height: 40, padding: '0 36px',
              borderRadius: 4, border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', color: 'var(--text-1)',
              fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4,
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Content area */}
        {query.trim() ? (
          /* ── Search results ── */
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <p style={{ margin: 0, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border-subtle)' }}>
              {t('fr_search_results')}
            </p>
            {searchLoading ? <Spinner /> : searchResults.length === 0
              ? <EmptyState icon={Search} title={t('fr_no_results_title')} sub={t('fr_no_results_sub')} />
              : searchResults.map((u) => <SearchCard key={u.id} u={u} />)
            }
          </div>
        ) : (
          /* ── Tabs ── */
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0 }}>
              {(['friends', 'requests'] as const).map((tabId) => (
                <button
                  key={tabId}
                  onClick={() => setTab(tabId)}
                  style={{
                    height: 36, padding: '0 14px', borderRadius: '8px 8px 0 0',
                    background: tab === tabId ? 'var(--bg-panel)' : 'transparent',
                    border: tab === tabId ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    borderBottom: tab === tabId ? '1px solid var(--bg-panel)' : '1px solid transparent',
                    marginBottom: tab === tabId ? -1 : 0,
                    color: tab === tabId ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: 13, fontWeight: tab === tabId ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {tabId === 'friends' ? (
                    <><Users size={13} /> {t('fr_tab_friends')} {friends.length > 0 && <span style={{ background: 'var(--bg-elevated)', borderRadius: 4, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{friends.length}</span>}</>
                  ) : (
                    <><Clock size={13} /> {t('fr_tab_requests')} {requestCount > 0 && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{requestCount}</span>}</>
                  )}
                </button>
              ))}
            </div>

            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '0 12px 12px 12px', overflow: 'hidden' }}>
              {dataLoading ? <Spinner /> : tab === 'friends' ? (
                friends.length === 0
                  ? <EmptyState icon={Users} title={t('fr_no_friends_title')} sub={t('fr_no_friends_sub')} />
                  : friends.map((f) => <FriendCard key={f.friendshipId} f={f} />)
              ) : (
                <>
                  {incoming.length === 0 && outgoing.length === 0 && (
                    <EmptyState icon={Clock} title={t('fr_no_requests_title')} sub={t('fr_no_requests_sub')} />
                  )}
                  {incoming.length > 0 && (
                    <>
                      <p style={{ margin: 0, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {t('fr_incoming')} ({incoming.length})
                      </p>
                      {incoming.map((r) => <RequestCard key={r.friendshipId} r={r} direction="incoming" />)}
                    </>
                  )}
                  {outgoing.length > 0 && (
                    <>
                      <p style={{ margin: 0, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {t('fr_outgoing')} ({outgoing.length})
                      </p>
                      {outgoing.map((r) => <RequestCard key={r.friendshipId} r={r} direction="outgoing" />)}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ?openChat=<userId> deep-link watcher — Suspense-isolated so
          useSearchParams() doesn't trigger Next.js's CSR-bailout. */}
      <Suspense fallback={null}>
        <OpenChatParamWatcher
          friends={friends}
          authReady={authReady}
          onOpen={setOpenChat}
        />
      </Suspense>

      {/* Direct-message chat panel (slides in from the right) */}
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
