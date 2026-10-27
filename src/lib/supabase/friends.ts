import { sb, userId } from './dbShared';

// ── Friends ───────────────────────────────────────────────────────────────────

export interface UserResult {
  id: string;
  username: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface FriendEntry {
  friendshipId: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
}

export interface FriendRequest {
  friendshipId: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
  createdAt: string;
}

export interface MyFriendship {
  friendshipId: string;
  otherUserId: string;
  status: 'pending' | 'accepted';
  isSender: boolean;
}

export async function searchUsers(query: string): Promise<UserResult[]> {
  if (!query.trim()) return [];
  const { data, error } = await sb().rpc('search_users', { search_query: query.trim() });
  if (error) { console.error('[DB] searchUsers error:', error.message); return []; }
  return (data ?? []).map((r: { id: string; username: string | null; email: string; avatar_url: string | null }) => ({
    id: r.id, username: r.username, email: r.email, avatarUrl: r.avatar_url,
  }));
}

export async function sendFriendRequest(receiverId: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const { data, error } = await sb()
    .from('friendships')
    .insert({ requester_id: uid, receiver_id: receiverId })
    .select('id').single();
  if (error) { console.error('[DB] sendFriendRequest error:', error.message); return null; }
  // The recipient's friend_request notification is produced by the
  // friendships_create_request_notification AFTER INSERT trigger — the
  // trigger reads requester_id from NEW so the actor is verified by the
  // friendships table's own RLS, not by a forgeable client claim.
  return data.id;
}

export async function cancelFriendRequest(friendshipId: string): Promise<void> {
  await sb().from('friendships').delete().eq('id', friendshipId);
}

export async function respondFriendRequest(
  friendshipId: string,
  status: 'accepted' | 'rejected',
): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb()
    .from('friendships').update({ status })
    .eq('id', friendshipId);
  if (error) return;
  // The friend_accepted notification (for the original requester) is
  // produced by the friendships_create_accepted_notification AFTER UPDATE
  // trigger, which only fires on pending → accepted transitions and
  // identifies the accepter via NEW.receiver_id (verified by RLS).
}

export async function removeFriend(friendshipId: string): Promise<void> {
  await sb().from('friendships').delete().eq('id', friendshipId);
}

export async function getFriends(): Promise<FriendEntry[]> {
  const uid = await userId(); if (!uid) return [];
  const { data: friendships } = await sb()
    .from('friendships').select('id, requester_id, receiver_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`);
  if (!friendships?.length) return [];
  const otherIds = friendships.map((f) => f.requester_id === uid ? f.receiver_id : f.requester_id);
  const { data: profiles } = await sb().from('profiles').select('id, username, avatar_url, is_vip').in('id', otherIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return friendships.map((f) => {
    const otherId = f.requester_id === uid ? f.receiver_id : f.requester_id;
    const p = profileMap.get(otherId);
    return { friendshipId: f.id, userId: otherId, username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null, isVip: p?.is_vip ?? false };
  });
}

export async function getFriendRequests(): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
  const uid = await userId(); if (!uid) return { incoming: [], outgoing: [] };
  const { data: rows } = await sb()
    .from('friendships').select('id, requester_id, receiver_id, created_at')
    .eq('status', 'pending')
    .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`);
  const incoming = (rows ?? []).filter((f) => f.receiver_id === uid);
  const outgoing = (rows ?? []).filter((f) => f.requester_id === uid);
  const allOtherIds = [...new Set([...incoming.map((f) => f.requester_id), ...outgoing.map((f) => f.receiver_id)])];
  const profileMap = new Map(
    allOtherIds.length
      ? ((await sb().from('profiles').select('id, username, avatar_url, is_vip').in('id', allOtherIds)).data ?? []).map((p) => [p.id, p])
      : [],
  );
  const toReq = (f: { id: string; requester_id: string; receiver_id: string; created_at: string }, otherId: string): FriendRequest => {
    const p = profileMap.get(otherId);
    return { friendshipId: f.id, userId: otherId, username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null, isVip: p?.is_vip ?? false, createdAt: f.created_at };
  };
  return { incoming: incoming.map((f) => toReq(f, f.requester_id)), outgoing: outgoing.map((f) => toReq(f, f.receiver_id)) };
}

export async function getMyFriendships(): Promise<MyFriendship[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb()
    .from('friendships').select('id, requester_id, receiver_id, status')
    .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`)
    .in('status', ['pending', 'accepted']);
  return (data ?? []).map((f) => ({
    friendshipId: f.id,
    otherUserId: f.requester_id === uid ? f.receiver_id : f.requester_id,
    status: f.status as 'pending' | 'accepted',
    isSender: f.requester_id === uid,
  }));
}

export async function inviteToRoom(
  friendId: string,
  roomId: string,
  roomName: string,
): Promise<{ error?: string }> {
  void roomName;
  const { data, error } = await sb().rpc('invite_to_room', {
    p_room_id: roomId,
    p_invitee_id: friendId,
  });
  if (error) {
    console.error('[DB] inviteToRoom RPC error:', error.message);
    return { error: error.message };
  }
  const result = String(data ?? '');
  return result === 'invited' ? {} : { error: result || 'invite_failed' };
}

export async function getMutualFriendCounts(otherUserIds: string[]): Promise<Record<string, number>> {
  if (!otherUserIds.length) return {};
  // SECURITY DEFINER RPC — bypasses friendships RLS so we can read the
  // other user's friend list, but only ever returns aggregate counts
  // (no IDs leak). See supabase/migrations/2026-06-28_mutual_friend_counts.sql.
  const { data, error } = await sb().rpc('mutual_friend_counts', { p_other_ids: otherUserIds });
  if (error) { console.error('[DB] getMutualFriendCounts error:', error.message); return {}; }
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ other_user_id: string; mutual_count: number }>) {
    map[row.other_user_id] = row.mutual_count;
  }
  return map;
}

// ── Follows ───────────────────────────────────────────────────────────────────

export async function followUser(targetId: string): Promise<void> {
  const uid = await userId(); if (!uid || uid === targetId) return;
  await sb().from('follows').upsert(
    { follower_id: uid, following_id: targetId },
    { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
  );
}

export async function unfollowUser(targetId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('follows').delete().eq('follower_id', uid).eq('following_id', targetId);
}

export async function getFollowCounts(targetId: string): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    sb().from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', targetId),
    sb().from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', targetId),
  ]);
  return { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

export async function getFollowingIds(): Promise<string[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('follows').select('following_id').eq('follower_id', uid);
  return (data ?? []).map((r) => r.following_id as string);
}

export async function isFollowing(targetId: string): Promise<boolean> {
  const uid = await userId(); if (!uid) return false;
  const { data } = await sb().from('follows').select('follower_id')
    .eq('follower_id', uid).eq('following_id', targetId).maybeSingle();
  return !!data;
}

