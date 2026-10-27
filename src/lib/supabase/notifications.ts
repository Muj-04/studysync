import { sb, userId } from './dbShared';

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export async function getNotifications(): Promise<AppNotification[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb()
    .from('notifications').select('id, type, data, read, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: r.id, type: r.type, data: r.data as Record<string, unknown>,
    read: r.read, createdAt: r.created_at,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  await sb().from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
}

export async function deleteNotification(id: string): Promise<void> {
  const uid = await userId();
  if (!uid) throw new Error('You must be signed in to delete notifications.');
  const { error } = await sb().from('notifications').delete().eq('id', id).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

export async function deleteAllNotifications(): Promise<void> {
  const uid = await userId();
  if (!uid) throw new Error('You must be signed in to delete notifications.');
  const { error } = await sb().from('notifications').delete().eq('user_id', uid);
  if (error) throw new Error(error.message);
}

