'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  sendDirectMessage,
  getConversation,
  markMessagesRead,
} from '@/lib/supabase/db';
import type { DirectMessage } from '@/lib/supabase/db';
import { activeDmChatRef } from '@/lib/activeDmChat';

/**
 * Reusable inner view of a 1:1 direct-message conversation:
 *   - fetches history on mount
 *   - subscribes to inbound INSERTs via postgres_changes
 *   - marks inbound messages read while open
 *   - renders bubbles + send input
 *
 * Used by BOTH:
 *   - ChatPanel.tsx (slide-in modal triggered from Friends page + NotificationBell)
 *   - ChatTabContent.tsx (workspace right-panel Chat tab embed)
 *
 * The outer chrome (slide-in animation, header with close button, fixed
 * positioning, OR the back-to-list header in the tab embed) is owned by
 * the wrapper, not by this component. This keeps both code paths
 * identical at the data layer.
 */

interface Props {
  friendId:     string;
  myUserId:     string;
  /** Called whenever this conversation flips remote-side unread → read.
      Lets the wrapper clear a per-friend unread badge. */
  onConversationRead?: (friendId: string) => void;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatConversationView({
  friendId, myUserId, onConversationRead,
}: Props) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tell useNotifications (via shared module ref) that THIS friend's chat
  // is currently active. Lets it suppress the bell-badge bump for new
  // direct_message notifications from this sender while the view is
  // mounted. Cleared on unmount.
  useEffect(() => {
    activeDmChatRef.current = friendId;
    return () => {
      if (activeDmChatRef.current === friendId) activeDmChatRef.current = null;
    };
  }, [friendId]);

  // Initial load + mark inbound as read.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getConversation(friendId).then(async (msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      setLoading(false);
      const hasUnread = msgs.some((m) => m.senderId === friendId && !m.read);
      if (hasUnread) {
        await markMessagesRead(friendId);
        onConversationRead?.(friendId);
      }
    });
    return () => { cancelled = true; };
  }, [friendId, onConversationRead]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Realtime: subscribe to INSERTs from this friend to me.
  // Same pattern as useStudyRoom's room_members DELETE subscription. RLS
  // ensures we only receive events for rows we can SELECT — i.e. messages
  // where we're the recipient (or sender).
  useEffect(() => {
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel(`direct_messages:${myUserId}:${friendId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'direct_messages',
          // Only inbound from THIS friend. Outbound (my own sends) we
          // append optimistically from sendDirectMessage's return.
          filter: `sender_id=eq.${friendId}`,
        },
        (payload) => {
          const r = payload.new as {
            id: string; sender_id: string; recipient_id: string;
            content: string; read: boolean; created_at: string;
          };
          if (r.recipient_id !== myUserId) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === r.id)) return prev;
            return [...prev, {
              id: r.id, senderId: r.sender_id, recipientId: r.recipient_id,
              content: r.content, read: r.read, createdAt: r.created_at,
            }];
          });
          // Mark this fresh message as read since the view is open.
          markMessagesRead(friendId).then(() => onConversationRead?.(friendId));
        },
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [friendId, myUserId, onConversationRead]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    const saved = await sendDirectMessage(friendId, trimmed);
    if (saved) {
      setMessages((prev) => prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]);
    } else {
      // Restore typed text on send failure.
      setText(trimmed);
    }
    setSending(false);
  }, [text, sending, friendId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: 13 }}>
            No messages yet — say hi.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === myUserId;
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: mine ? 'flex-end' : 'flex-start',
                  gap: 2,
                }}
              >
                <div style={{
                  padding: '7px 11px',
                  borderRadius: mine ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  background: mine ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: mine ? '#fff' : 'var(--text-1)',
                  fontSize: 13, lineHeight: 1.45,
                  wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                  border: mine ? 'none' : '1px solid var(--border-subtle)',
                }}>
                  {m.content}
                </div>
                <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                  {fmtTime(m.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 6,
        padding: '10px 12px', borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message…"
          rows={1}
          style={{
            flex: 1, resize: 'none',
            minHeight: 36, maxHeight: 120,
            padding: '8px 10px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text-1)',
            fontSize: 13, fontFamily: 'inherit', lineHeight: 1.4,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          aria-label="Send"
          style={{
            width: 36, height: 36, borderRadius: 4,
            background: text.trim() && !sending ? 'var(--accent)' : 'var(--bg-elevated)',
            color: text.trim() && !sending ? '#fff' : 'var(--text-3)',
            border: 'none',
            cursor: text.trim() && !sending ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.12s, color 0.12s',
            flexShrink: 0,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
