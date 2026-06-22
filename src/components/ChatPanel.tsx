'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  sendDirectMessage,
  getConversation,
  markMessagesRead,
} from '@/lib/supabase/db';
import type { DirectMessage } from '@/lib/supabase/db';

interface Props {
  friendId:     string;
  friendName:   string;
  friendAvatar: string | null;
  myUserId:     string;
  onClose:      () => void;
  // Called whenever this conversation flips remote-side unread → read,
  // so the parent can clear the per-friend unread badge.
  onConversationRead?: (friendId: string) => void;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: url ? 'transparent' : 'var(--accent)', color: '#fff',
      fontSize: size * 0.38, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
    </div>
  );
}

export default function ChatPanel({
  friendId, friendName, friendAvatar, myUserId, onClose, onConversationRead,
}: Props) {
  const [messages, setMessages]   = useState<DirectMessage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Initial load + mark inbound as read ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getConversation(friendId).then(async (msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      setLoading(false);
      // Mark any unread inbound messages from this friend as read.
      // RLS limits this to (sender=friend, recipient=me, read=false).
      const hasUnread = msgs.some((m) => m.senderId === friendId && !m.read);
      if (hasUnread) {
        await markMessagesRead(friendId);
        onConversationRead?.(friendId);
      }
    });
    return () => { cancelled = true; };
  }, [friendId, onConversationRead]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Realtime: subscribe to INSERTs from this friend to me ───────────────────
  // Uses the same postgres_changes pattern as useStudyRoom's room_members
  // DELETE subscription. RLS ensures we only receive events for rows we can
  // SELECT — i.e. messages where we're the recipient (or sender).
  useEffect(() => {
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel(`direct_messages:${myUserId}:${friendId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
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
          // Mark this fresh message as read since the panel is open.
          // No await — fire and forget; failure is non-critical (next open
          // of the panel will catch up).
          markMessagesRead(friendId).then(() => onConversationRead?.(friendId));
        },
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [friendId, myUserId, onConversationRead]);

  // ── Send handler ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    const saved = await sendDirectMessage(friendId, trimmed);
    if (saved) {
      setMessages((prev) => prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]);
    } else {
      // Send failed — restore the typed text so the user doesn't lose it.
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-label={`Chat with ${friendName}`}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: '100vw',
        background: 'var(--bg-app, #0f1117)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column',
        zIndex: 100,
        animation: 'chatpanel-slide 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      <style>{`
        @keyframes chatpanel-slide {
          from { transform: translateX(100%); }
          to   { transform: translateX(0);    }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <Avatar name={friendName} url={friendAvatar} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {friendName}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          style={{
            width: 30, height: 30, borderRadius: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
          onMouseOut={(e)  => Object.assign(e.currentTarget.style, { background: 'transparent',     color: 'var(--text-3)' })}
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
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
