'use client';

import { useEffect, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { ChevronLeft, MessageSquare, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  getFriends, getUnreadMessageCounts, getConversation,
} from '@/lib/supabase/db';
import type { FriendEntry } from '@/lib/supabase/db';
import ChatConversationView from '@/components/ChatConversationView';

/**
 * Right-panel Chat tab: two-level view.
 *
 * Level 1 — conversation LIST: rows of (avatar, name, last-message preview,
 * timestamp, unread badge). Built from existing getFriends() +
 * getUnreadMessageCounts() + per-friend last-message fetch via
 * getConversation(). N+1 queries — acceptable for v1 ≤20 friends; flagged
 * for a future optimization (single ranked-join query).
 *
 * Level 2 — open CONVERSATION: renders <ChatConversationView> for the
 * selected friend. ChatConversationView is the same component the slide-in
 * ChatPanel uses, so the chat behaviour (realtime, mark-as-read,
 * activeDmChatRef, send) is identical.
 */

interface Props {
  myUserId: string | null;
}

interface ConversationListEntry {
  friend:     FriendEntry;
  lastText:   string | null;
  lastAt:     string | null;
  unread:     number;
}

function fmtListTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  const sixDaysAgo = new Date(now); sixDaysAgo.setDate(now.getDate() - 6);
  if (d > sixDaysAgo) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Avatar({ name, url, size = 38, online = false }: {
  name: string | null; url: string | null; size?: number; online?: boolean;
}) {
  const initial = ((name ?? '?')[0] ?? '?').toUpperCase();
  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: url ? 'transparent' : 'var(--accent)', color: '#fff',
        fontSize: size * 0.4, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {url
          ? <img src={url} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initial}
      </div>
      {online && (
        <span style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 10, height: 10, borderRadius: '50%',
          background: 'var(--green)',
          border: '2px solid var(--bg-app)',
        }} />
      )}
    </div>
  );
}

export default function ChatTabContent({ myUserId }: Props) {
  const [entries, setEntries] = useState<ConversationListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

  // Fetch the conversation list (friends + unread + last message per friend).
  const loadList = useCallback(async () => {
    const [friends, unread] = await Promise.all([
      getFriends(),
      getUnreadMessageCounts(),
    ]);
    // Per-friend last message: N+1, acceptable for v1.
    const withLast = await Promise.all(friends.map(async (f) => {
      const conv = await getConversation(f.userId);
      const last = conv[conv.length - 1] ?? null;
      return {
        friend: f,
        lastText:  last?.content   ?? null,
        lastAt:    last?.createdAt ?? null,
        unread:    unread[f.userId] ?? 0,
      } satisfies ConversationListEntry;
    }));
    // Sort by most recent activity (last message timestamp, then unread, then name)
    withLast.sort((a, b) => {
      if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
      if (a.lastAt && !b.lastAt) return -1;
      if (!a.lastAt && b.lastAt) return  1;
      if (a.unread !== b.unread) return b.unread - a.unread;
      return (a.friend.username ?? '').localeCompare(b.friend.username ?? '');
    });
    setEntries(withLast);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!myUserId) return;
    const timeoutId = window.setTimeout(() => { void loadList(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [myUserId, loadList]);

  // Realtime: any new direct_message TO me bumps the list — re-fetch to
  // refresh unread + last-message preview. Scoped to me via the RLS-allowed
  // SELECT filter.
  useEffect(() => {
    if (!myUserId) return;
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel(`direct_messages_list:${myUserId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'direct_messages',
          filter: `recipient_id=eq.${myUserId}`,
        },
        () => { void loadList(); },
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [myUserId, loadList]);

  // ── Conversation view ──────────────────────────────────────────────────────
  if (selectedFriendId && myUserId) {
    const sel = entries.find((e) => e.friend.userId === selectedFriendId);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-app)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          minHeight: 58, padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => { setSelectedFriendId(null); void loadList(); }}
            aria-label="Back to conversations"
            style={{
              width: 30, height: 30, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-2)',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
            onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'transparent',     color: 'var(--text-2)' })}
          >
            <ChevronLeft size={19} />
          </button>
          <Avatar name={sel?.friend.username ?? null} url={sel?.friend.avatarUrl ?? null} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{
              margin: 0, fontSize: 13.5, fontWeight: 650, color: 'var(--text-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sel?.friend.username ?? 'Friend'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--text-3)' }}>
              Direct message
            </p>
          </div>
        </div>

        <ChatConversationView
          key={selectedFriendId}
          friendId={selectedFriendId}
          myUserId={myUserId}
          onConversationRead={() => { void loadList(); }}
        />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-app)' }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px 12px', flexShrink: 0,
      }}>
        <p style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-1)', margin: 0 }}>
          Messages
        </p>
        <a
          href="/friends"
          aria-label="New conversation"
          title="Pick a friend to message"
          style={{
            width: 28, height: 28, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-muted)', color: 'var(--accent)', textDecoration: 'none',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
          onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'var(--accent-muted)', color: 'var(--accent)' })}
        >
          <Plus size={16} />
        </a>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <MessageSquare size={20} style={{ color: 'var(--text-3)', opacity: 0.4, marginBottom: 8 }} />
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', margin: '0 0 4px' }}>
              No conversations yet
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
              Add friends to start a chat.
            </p>
          </div>
        ) : (
          entries.map((e) => (
            <button
              key={e.friend.userId}
              onClick={() => setSelectedFriendId(e.friend.userId)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                minHeight: 66, padding: '10px 12px', borderRadius: 14, marginBottom: 8,
                background: 'var(--bg-panel)', border: '1px solid var(--border)', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.025)',
                transition: 'background 0.12s, border-color 0.12s, transform 0.12s',
              }}
              onMouseOver={(ev) => Object.assign(ev.currentTarget.style, {
                background: 'var(--bg-hover)', borderColor: 'var(--border-strong)', transform: 'translateY(-1px)',
              })}
              onMouseOut={(ev) => Object.assign(ev.currentTarget.style, {
                background: 'var(--bg-panel)', borderColor: 'var(--border)', transform: 'translateY(0)',
              })}
            >
              <Avatar name={e.friend.username} url={e.friend.avatarUrl} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 650, color: 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {e.friend.username ?? 'Friend'}
                  </p>
                  {e.lastAt && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                      {fmtListTime(e.lastAt)}
                    </span>
                  )}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2,
                }}>
                  <p style={{
                    margin: 0, fontSize: 12, color: e.unread > 0 ? 'var(--text-1)' : 'var(--text-2)',
                    fontWeight: e.unread > 0 ? 550 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {e.lastText ?? 'No messages yet'}
                  </p>
                  {e.unread > 0 && (
                    <span style={{
                      flexShrink: 0, minWidth: 20, height: 20, borderRadius: 10,
                      background: 'var(--red)', color: '#fff',
                      fontSize: 10.5, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 5px',
                    }}>
                      {e.unread > 99 ? '99+' : e.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
