'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, Check, X, Users, BookOpen, MessageSquare, Trash2 } from 'lucide-react';
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
  const { notifications, unreadCount, markRead, markAllRead, deleteNotif, deleteAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'all' | 'unread'>('all');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState<string | null>(null);
  const [deleteAllPending, setDeleteAllPending] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const visibleNotifications = view === 'all'
    ? notifications
    : notifications.filter((notification) => !notification.read);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Action handlers mark the notification READ rather than deleting it,
  // so the list keeps its history (like an email inbox). The Dismiss
  // button on `friend_accepted` (further down) is intentionally still a
  // delete — it's the only way to clear a notification type that has no
  // interactive action of its own.
  const handleAccept = useCallback(async (notifId: string, friendshipId: string) => {
    setActionPending(notifId);
    await respondFriendRequest(friendshipId, 'accepted');
    await markRead(notifId);
    setActionPending(null);
  }, [markRead]);

  const handleReject = useCallback(async (notifId: string, friendshipId: string) => {
    setActionPending(notifId);
    await respondFriendRequest(friendshipId, 'rejected');
    await markRead(notifId);
    setActionPending(null);
  }, [markRead]);

  const handleJoinRoom = useCallback(async (notifId: string, roomId: string) => {
    await markRead(notifId);
    router.push(`/room/${roomId}`);
    setOpen(false);
  }, [markRead, router]);

  // direct_message: route to /friends?openChat=<senderId>. The friends
  // page reads that param on mount and pre-opens ChatPanel for the
  // matching friend, so this works regardless of which page the bell
  // is being opened from (workspace / dashboard / room / friends).
  const handleOpenChat = useCallback(async (notifId: string, senderId: string) => {
    await markRead(notifId);
    setOpen(false);
    router.push(`/friends?openChat=${encodeURIComponent(senderId)}`);
  }, [markRead, router]);

  const handleDeclineInvite = useCallback(async (notifId: string) => {
    await markRead(notifId);
  }, [markRead]);

  const handleDelete = useCallback(async (notifId: string) => {
    setDeletePending(notifId);
    setDeleteError('');
    try {
      await deleteNotif(notifId);
    } catch {
      setDeleteError('Could not delete this notification. Please try again.');
    } finally {
      setDeletePending(null);
    }
  }, [deleteNotif]);

  const handleDeleteAll = useCallback(async () => {
    if (!window.confirm(t('notif_delete_all_confirm'))) return;
    setDeleteAllPending(true);
    setDeleteError('');
    try {
      await deleteAll();
    } catch {
      setDeleteError('Could not delete notifications. Please try again.');
    } finally {
      setDeleteAllPending(false);
    }
  }, [deleteAll, t]);

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
            background: 'var(--bg-float)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--bg-float-border)', boxShadow: 'var(--shadow-float)', borderRadius: 4,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    fontSize: 11.5, color: 'var(--accent)', background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px', borderRadius: 4,
                    transition: 'background 0.12s',
                  }}
                >
                  {t('notif_mark_read')}
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  disabled={deleteAllPending}
                  style={{
                    fontSize: 11.5, color: 'var(--red)', background: 'none', border: 'none',
                    cursor: deleteAllPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    padding: '2px 6px', borderRadius: 4, opacity: deleteAllPending ? 0.5 : 1,
                  }}
                >
                  {t('notif_delete_all')}
                </button>
              )}
            </div>
          </div>

          {/* Read status is a filter, not a deletion rule. */}
          <div style={{
            display: 'flex', gap: 4, padding: '7px 12px',
            borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
          }}>
            {(['all', 'unread'] as const).map((tab) => {
              const active = view === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setView(tab)}
                  style={{
                    height: 27, padding: '0 11px', borderRadius: 5,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11.5, fontWeight: active ? 650 : 500,
                    color: active ? 'var(--accent)' : 'var(--text-3)',
                    background: active ? 'var(--accent-muted)' : 'transparent',
                  }}
                >
                  {tab === 'all' ? t('notif_all') : `${t('notif_unread')}${unreadCount ? ` (${unreadCount})` : ''}`}
                </button>
              );
            })}
          </div>

          {deleteError && (
            <div role="alert" style={{
              padding: '8px 12px', background: 'rgba(239,68,68,0.1)',
              borderBottom: '1px solid rgba(239,68,68,0.25)',
              color: 'var(--red)', fontSize: 11.5, lineHeight: 1.4,
            }}>
              {deleteError}
            </div>
          )}

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visibleNotifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                {view === 'unread' ? t('notif_no_unread') : t('notif_empty')}
              </div>
            ) : (
              visibleNotifications.map((n) => {
                const isPending = actionPending === n.id;
                const d = n.data;
                const senderName = (d.requester_name ?? d.accepter_name ?? d.inviter_name ?? d.sender_name ?? 'Someone') as string;
                const senderAvatar = (d.requester_avatar ?? d.accepter_avatar ?? d.inviter_avatar ?? d.sender_avatar ?? null) as string | null;

                return (
                  <div
                    key={n.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: n.read ? 'transparent' : 'var(--accent-muted)',
                      opacity: isPending ? 0.6 : n.read ? 0.76 : 1,
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
                          {n.type === 'direct_message' && (
                            <><strong>{senderName}</strong> sent you a message</>
                          )}
                        </p>
                        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-3)' }}>{timeAgo(n.createdAt)}</p>

                        {/* Action buttons — hidden once the notification has
                            been read, because the action has already been
                            taken and re-clicking would re-fire the
                            respondFriendRequest / router.push call. The
                            notification body + sender + timestamp + read
                            styling all stay visible. */}
                        {n.type === 'friend_request' && !n.read && (
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
                        {n.type === 'room_invite' && !n.read && (
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
                        {n.type === 'direct_message' && !n.read && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleOpenChat(n.id, String(d.sender_id))}
                              style={{
                                height: 26, padding: '0 10px', borderRadius: 4,
                                background: '#ffffff', color: '#0f172a',
                                border: 'none', fontSize: 11.5, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <MessageSquare size={11} /> Open chat
                            </button>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
                        <button
                          onClick={() => handleDelete(n.id)}
                          disabled={deletePending === n.id}
                          title={t('notif_delete')}
                          aria-label={t('notif_delete')}
                          style={{
                            width: 24, height: 24, borderRadius: 4, border: 'none',
                            display: 'grid', placeItems: 'center', cursor: 'pointer',
                            background: 'transparent', color: 'var(--text-3)',
                            opacity: deletePending === n.id ? 0.45 : 1,
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
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
