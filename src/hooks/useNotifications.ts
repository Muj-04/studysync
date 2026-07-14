'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, deleteAllNotifications } from '@/lib/supabase/db';
import type { AppNotification } from '@/lib/supabase/db';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { activeDmChatRef } from '@/lib/activeDmChat';

export type { AppNotification };

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }

      getNotifications().then((notifs) => {
        setNotifications(notifs);
        setUnreadCount(notifs.filter((n) => !n.read).length);
        setLoading(false);
      });

      const channel = supabase
        .channel(`user-notifications:${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const raw = payload.new as { id: string; type: string; data: Record<string, unknown>; read: boolean; created_at: string };
            // Direct-message notifications that target the currently-open
            // ChatPanel: the user is already watching this conversation,
            // so we don't want the bell badge to flash. Insert the row as
            // already-read (server + local state), don't bump the count.
            // Other types — and direct_messages from any OTHER friend —
            // fall through to the normal "unread + bump" path.
            const dmSenderId = raw.type === 'direct_message'
              ? (raw.data?.sender_id as string | undefined)
              : undefined;
            const suppressBadge =
              raw.type === 'direct_message'
              && !!dmSenderId
              && activeDmChatRef.current === dmSenderId;

            if (suppressBadge) {
              const notif: AppNotification = {
                id: raw.id, type: raw.type, data: raw.data,
                read: true, createdAt: raw.created_at,
              };
              setNotifications((prev) => [notif, ...prev]);
              // Persist the read flip — fire-and-forget; if it fails the
              // worst case is the badge increments the next time the user
              // visits a page that calls getNotifications().
              markNotificationRead(raw.id).catch(() => {});
              return;
            }

            const notif: AppNotification = {
              id: raw.id, type: raw.type, data: raw.data,
              read: raw.read, createdAt: raw.created_at,
            };
            setNotifications((prev) => [notif, ...prev]);
            if (!raw.read) setUnreadCount((c) => c + 1);
          },
        )
        .subscribe();

      channelRef.current = channel;
    });

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, []);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const notif = prev.find((n) => n.id === id);
      if (notif && !notif.read) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const deleteNotif = useCallback(async (id: string) => {
    await deleteNotification(id);
    setNotifications((prev) => {
      const notif = prev.find((n) => n.id === id);
      if (notif && !notif.read) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  const deleteAll = useCallback(async () => {
    await deleteAllNotifications();
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, loading, markRead, markAllRead, removeNotification, deleteNotif, deleteAll };
}
