import { sb, userId } from './dbShared';
import { makeFallbackProfileHandle, normalizeProfileHandle, validateProfileHandle } from '@/lib/profileHandle';
import { getFollowCounts, isFollowing } from './friends';

// ── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<{
  username: string | null;
  handle: string;
  avatarUrl: string | null;
  plan: 'free' | 'premium' | 'pro';
  isVip: boolean;
} | null> {
  const uid = await userId(); if (!uid) return null;
  const { data } = await sb()
    .from('profiles')
    .select('username, handle, avatar_url, plan, is_vip')
    .eq('id', uid)
    .maybeSingle();
  return data ? {
    username: data.username ?? null,
    handle: data.handle,
    avatarUrl: data.avatar_url ?? null,
    plan: (data.plan ?? 'free') as 'free' | 'premium' | 'pro',
    isVip: data.is_vip ?? false,
  } : null;
}

export async function updateUserPlan(plan: 'free' | 'premium' | 'pro'): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('profiles').update({ plan }).eq('id', uid);
}

export async function isProfileHandleAvailable(value: string): Promise<boolean> {
  const handle = normalizeProfileHandle(value);
  if (validateProfileHandle(handle)) return false;
  const { data, error } = await sb().rpc('is_handle_available', { p_handle: handle });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function upsertProfile(profile: { username?: string; handle?: string; avatarUrl?: string }): Promise<void> {
  const uid = await userId();
  if (!uid) throw new Error('You must be signed in to update your profile.');
  const { sanitizeText } = await import('@/lib/sanitize');
  const update: Record<string, string | null> = {};
  if ('username' in profile) {
    const username = profile.username ? sanitizeText(profile.username).trim().slice(0, 50) : '';
    if (!username) throw new Error('Display name cannot be empty.');
    update.username = username;
  }
  if ('handle' in profile) {
    const handle = normalizeProfileHandle(profile.handle ?? '');
    const validationError = validateProfileHandle(handle);
    if (validationError) throw new Error(validationError);
    update.handle = handle;
  }
  if ('avatarUrl' in profile) update.avatar_url = profile.avatarUrl || null;

  const client = sb();
  const { data: existing, error: readError } = await client
    .from('profiles')
    .select('handle')
    .eq('id', uid)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const handle = typeof update.handle === 'string'
    ? update.handle
    : existing?.handle ?? makeFallbackProfileHandle(update.username, uid);
  const { error } = await client
    .from('profiles')
    .upsert({ id: uid, handle, ...update }, { onConflict: 'id' });
  if (error) {
    if (error.code === '23505') throw new Error('This handle is already taken.');
    throw new Error(error.message);
  }
}

// Creates a profile row for OAuth users on first sign-in if one doesn't exist.
// Safe to call on every login — ignoreDuplicates prevents overwrites.
export async function ensureProfile(): Promise<void> {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return;
  const existing = await sb().from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return; // already exists
  const meta = user.user_metadata ?? {};
  const username =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    (meta.preferred_username as string | undefined) ??
    user.email?.split('@')[0] ??
    null;
  const avatarUrl =
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined) ??
    null;
  const handle = makeFallbackProfileHandle(username, user.id);
  const { error } = await sb()
    .from('profiles')
    .upsert({ id: user.id, username, handle, avatar_url: avatarUrl }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function uploadAvatar(file: File): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${uid}/avatar.${ext}`;
  const { error } = await sb().storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) { console.error('[DB] uploadAvatar error:', error.message); return null; }
  // Bust the cache so the new image is served immediately (append a timestamp)
  const { data } = sb().storage.from('avatars').getPublicUrl(path);
  return data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
}

// ── User Profile (public) ─────────────────────────────────────────────────────

export interface PublicProfile {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
  followersCount: number;
  followingCount: number;
  isFollowedByMe: boolean;
}

export async function getPublicProfile(targetId: string): Promise<PublicProfile | null> {
  const uid = await userId();
  const [profileRes, countsData, followingData] = await Promise.all([
    sb().from('profiles').select('username, avatar_url, is_vip').eq('id', targetId).maybeSingle(),
    getFollowCounts(targetId),
    uid && uid !== targetId ? isFollowing(targetId) : Promise.resolve(false),
  ]);
  if (!profileRes.data && !profileRes.error) return null;
  return {
    userId: targetId,
    username: profileRes.data?.username ?? null,
    avatarUrl: profileRes.data?.avatar_url ?? null,
    isVip: profileRes.data?.is_vip ?? false,
    followersCount: countsData.followers,
    followingCount: countsData.following,
    isFollowedByMe: followingData as boolean,
  };
}

