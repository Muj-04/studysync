import { createClient } from './client';
import type { DirectMessage } from './db';

export async function getConversation(friendId: string, limit = 100, before?: { createdAt: string; id: string }): Promise<DirectMessage[]> {
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return [];
  let query = client.from('direct_messages').select('id,sender_id,recipient_id,content,read,created_at')
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${user.id})`);
  if (before) query = query.or(`created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`);
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error(error.message);
  return (data ?? []).reverse().map((row) => ({
    id: row.id, senderId: row.sender_id, recipientId: row.recipient_id,
    content: row.content, read: row.read, createdAt: row.created_at,
  }));
}

export async function markMessagesRead(friendId: string, messageIds: string[]): Promise<void> {
  if (!messageIds.length) return;
  const client = createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client.from('direct_messages').update({ read: true })
    .eq('sender_id', friendId).eq('recipient_id', user.id).eq('read', false).in('id', messageIds);
  if (error) throw new Error(error.message);
}

export function mergeMessages(previous: DirectMessage[], incoming: DirectMessage[]) {
  const byId = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}
