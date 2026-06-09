'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, Check, X, Users, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';
import { respondFriendRequest } from '@/lib/supabase/db';
import { useLanguage } from '@/contexts/LanguageContext';

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
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {url
        ? <img src={url} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
    </div>
  );
}

export default function NotificationBell() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead, deleteNotif } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleAccept = useCallback(async (notifId: string, friendshipId: string) => {
    setActionPending(notifId);
    await respondFriendRequest(friendshipId, 'accepted');
    await deleteNotif(notifId);
    setActionPending(null);
  }, [deleteNotif]);

  const handleReject = useCallback(async (notifId: string, friendshipId: string) => {
    setActionPending(notifId);
    await respondFriendRequest(friendshipId, 'rejected');
    await deleteNotif(notifId);
    setActionPending(null);
  }, [deleteNotif]);

  const handleJoinRoom = useCallback(async (notifId: string, roomId: string) => {
    await deleteNotif(notifId);
    router.push(`/room/${roomId}`);
    setOpen(false);
  }, [deleteNotif, router]);

  const handleDeclineInvite = useCallback(async (notifId: string) => {
    await deleteNotif(notifId);
  }, [deleteNotif]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('notif_title')}
        aria-label={t('notif_title')}
        style={{
          position: 'relative',
          width: 34, height: 34, borderRadius: 4,
          background: open ? 'var(--bg-hover)' : 'transparent',
          border: '1px solid transparent',
          color: 'var(--text-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--bg-hover)', color: 'var(--text-1)' })}
        onMouseOut={(e) => { if (!open) Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-2)' }); }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 16, height: 16, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, minWidth: 16,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="animate-scale-in"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)',
            ...(lang === 'ar' ? { left: 0 } : { right: 0 }),
            width: 340, maxHeight: 480, overflow: 'hidden',
            transformOrigin: lang === 'ar' ? 'top left' : 'top right',
            background: 'var(--bg-panel)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            zIndex: 9999, display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px 10px', borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{t('notif_title')}</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  fontSize: 11.5, color: 'var(--accent)', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px', borderRadius: 4,
                  transition: 'background 0.12s',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-muted)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                {t('notif_mark_read')}
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                {t('notif_empty')}
              </div>
            ) : (
              notifications.map((n) => {
                const isPending = actionPending === n.id;
                const d = n.data;
                const senderName = (d.requester_name ?? d.accepter_name ?? d.inviter_name ?? 'Someone') as string;
                const senderAvatar = (d.requester_avatar ?? d.accepter_avatar ?? d.inviter_avatar ?? null) as string | null;

                return (
                  <div
                    key={n.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: n.read ? 'transparent' : 'var(--accent-muted)',
                      opacity: isPending ? 0.6 : 1,
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      {/* Icon or avatar */}
                      <div style={{ flexShrink: 0, marginTop: 1 }}>
                        {n.type === 'room_invite'
                          ? (
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: 'var(--accent-muted)', color: 'var(--accent)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <BookOpen size={14} />
                            </div>
                          )
                          : <Avatar name={senderName} url={senderAvatar} size={32} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Text */}
                        <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 }}>
                          {n.type === 'friend_request' && (
                            <><strong>{senderName}</strong> {t('notif_friend_request')}</>
                          )}
                          {n.type === 'friend_accepted' && (
                            <><strong>{senderName}</strong> {t('notif_friend_accepted')}</>
                          )}
                          {n.type === 'room_invite' && (
                            <><strong>{senderName}</strong> {t('notif_room_invite')} <strong>{String(d.room_name ?? 'a study room')}</strong></>
                          )}
                        </p>
                        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-3)' }}>{timeAgo(n.createdAt)}</p>

                        {/* Action buttons */}
                        {n.type === 'friend_request' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleAccept(n.id, String(d.friendship_id))}
                              disabled={isPending}
                              style={{
                                height: 26, padding: '0 10px', borderRadius: 4,
                                background: '#ffffff', color: '#0f172a',
                                border: 'none', fontSize: 11.5, fontWeight: 600,
                                cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <Check size={11} /> {t('notif_accept')}
                            </button>
                            <button
                              onClick={() => handleReject(n.id, String(d.friendship_id))}
                              disabled={isPending}
                              style={{
                                height: 26, padding: '0 10px', borderRadius: 4,
                                background: 'var(--bg-elevated)', color: 'var(--text-2)',
                                border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 500,
                                cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <X size={11} /> {t('notif_reject')}
                            </button>
                          </div>
                        )}
                        {n.type === 'room_invite' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleJoinRoom(n.id, String(d.room_id))}
                              style={{
                                height: 26, padding: '0 10px', borderRadius: 4,
                                background: '#ffffff', color: '#0f172a',
                                border: 'none', fontSize: 11.5, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <BookOpen size={11} /> {t('notif_join_room')}
                            </button>
                            <button
                              onClick={() => handleDeclineInvite(n.id)}
                              style={{
                                height: 26, padding: '0 10px', borderRadius: 4,
                                background: 'var(--bg-elevated)', color: 'var(--text-2)',
                                border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 500,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              {t('notif_decline')}
                            </button>
                          </div>
                        )}
                        {n.type === 'friend_accepted' && (
                          <button
                            onClick={() => deleteNotif(n.id)}
                            style={{
                              height: 22, padding: '0 8px', borderRadius: 4,
                              background: 'none', color: 'var(--text-3)', border: 'none',
                              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            {t('notif_dismiss')}
                          </button>
                        )}
                      </div>

                      {/* Unread dot */}
                      {!n.read && (
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: 'var(--accent)', flexShrink: 0, marginTop: 6,
                        }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: link to friends page */}
          <div style={{
            padding: '8px 14px', borderTop: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}>
            <a
              href="/friends"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)',
                textDecoration: 'none', transition: 'color 0.12s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)'; }}
            >
              <Users size={13} /> {t('notif_manage_friends')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
