'use client';

import { X } from 'lucide-react';
import ChatConversationView from '@/components/ChatConversationView';

/**
 * Slide-in chat modal used by:
 *   - /friends page (clicking a friend's Chat button)
 *   - NotificationBell (clicking an unread direct_message)
 *
 * Inner messages + send-input logic lives in ChatConversationView so it
 * can be shared with the workspace right-panel Chat tab. This wrapper
 * owns only the slide-in chrome (positioning, animation, header with
 * close button).
 */

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

function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
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
  return (
    <div
      role="dialog"
      aria-label={`Chat with ${friendName}`}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380, maxWidth: '100vw',
        background: 'var(--bg-app)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-float)',
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

      <ChatConversationView
        friendId={friendId}
        myUserId={myUserId}
        onConversationRead={onConversationRead}
      />
    </div>
  );
}
