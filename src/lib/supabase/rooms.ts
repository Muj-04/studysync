import { sb, userId } from './dbShared';

// ── Study Rooms ───────────────────────────────────────────────────────────────

export async function uploadRoomPdf(roomId: string, blob: Blob, docName: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  if (blob.size > 50 * 1024 * 1024) { console.error('[DB] uploadRoomPdf: file too large'); return null; }
  // Verify PDF magic bytes (%PDF)
  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46) {
    console.error('[DB] uploadRoomPdf: invalid PDF magic bytes');
    return null;
  }
  const path = `${uid}/rooms/${roomId}/${docName}.pdf`;
  const { error } = await sb().storage.from('pdfs').upload(path, blob, {
    contentType: 'application/pdf', upsert: true,
  });
  if (error) { console.error('[DB] uploadRoomPdf error:', error.message); return null; }
  return path;
}

export async function createRoom(roomId: string, docName: string, pdfPath: string, maxMembers: number = 5): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const { error } = await sb().from('study_rooms').insert({
    id: roomId, host_user_id: uid, document_name: docName, pdf_path: pdfPath,
    status: 'active', max_members: maxMembers, expires_at: expiresAt,
  });
  if (error) { console.error('[DB] createRoom error:', error.message); return null; }
  return roomId;
}

export async function fetchRoom(roomId: string): Promise<{
  id: string; documentName: string; pdfPath: string; hostUserId: string;
  status: 'active' | 'closed'; maxMembers: number; expiresAt: string | null;
} | null> {
  const { data, error } = await sb().from('study_rooms').select('*').eq('id', roomId).single();
  if (error || !data) { console.error('[DB] fetchRoom error:', error?.message); return null; }
  return {
    id: data.id, documentName: data.document_name, pdfPath: data.pdf_path, hostUserId: data.host_user_id,
    status: (data.status ?? 'active') as 'active' | 'closed',
    maxMembers: data.max_members ?? 10,
    expiresAt: data.expires_at ?? null,
  };
}

export async function joinRoom(roomId: string): Promise<{ error?: string }> {
  // Atomic join via SECURITY DEFINER RPC — locks study_rooms row, checks
  // capacity under the lock, inserts on success. The previous JS body
  // was read-then-write (audit C-5): two concurrent joiners both saw
  // count<max and both inserted, exceeding the cap and bypassing the
  // Premium/Pro room-size paywall.
  //
  // Hardened by supabase/migrations/20260710093000_secure_room_invitations.sql
  // RPC also enforces plan and invitation checks server-side.
  // Session-state probe — confirms whether the client we're about to call
  // the RPC with actually has a valid JWT. A null/expired session here
  // explains the 403s on the subsequent room_members SELECT (auth.uid()
  // resolves to null inside Postgres → RLS rejects).
  const client = sb();
  const { data: sess } = await client.auth.getSession();
  console.log('[DB] joinRoom session probe', {
    hasSession:   !!sess.session,
    userId:       sess.session?.user?.id ?? null,
    expiresAt:    sess.session?.expires_at ?? null,
    expiresInSec: sess.session?.expires_at ? (sess.session.expires_at - Math.floor(Date.now() / 1000)) : null,
  });
  const { data, error } = await client.rpc('join_room_atomic', { p_room_id: roomId });
  if (error) {
    console.error('[DB] joinRoom RPC error:', error.message);
    return { error: error.message };
  }
  const result = (data ?? '') as string;
  if (result === 'joined' || result === 'rejoined') return {};
  return { error: result };
}

export async function leaveRoom(roomId: string): Promise<{ wasLastMember: boolean; error?: string }> {
  const client = sb();
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) {
    return { wasLastMember: false, error: 'unauthenticated' };
  }
  try {
    const response = await fetch('/api/room/leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ roomId }),
    });
    if (!response.ok) return { wasLastMember: false, error: `leave failed (${response.status})` };
    const result = await response.json() as { wasLastMember?: boolean };
    return { wasLastMember: result.wasLastMember === true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'leave failed';
    console.error('[DB] leaveRoom request error:', message);
    return { wasLastMember: false, error: message };
  }
}

export async function closeRoom(roomId: string): Promise<void> {
  const { error } = await sb().from('study_rooms').update({ status: 'closed' }).eq('id', roomId);
  if (error) throw new Error(error.message);
}

// ── Study Rooms — listing ─────────────────────────────────────────────────────

export interface ActiveRoomMember {
  userId:    string;
  username:  string | null;
  avatarUrl: string | null;
  isVip:     boolean;
}

export interface ActiveRoom {
  id:           string;
  hostUserId:   string;
  documentName: string;
  status:       'active' | 'closed';
  maxMembers:   number;
  expiresAt:    string | null;
  createdAt:    string;
  host:         ActiveRoomMember | null;
  memberCount:  number;
  /** Up to 6 sample members for the avatar stack. */
  members:      ActiveRoomMember[];
  /** Whether the caller is already a member (host or invitee). */
  myMembership: boolean;
}

/**
 * Returns all currently-active rooms with batched joins:
 *   1) study_rooms (status=active)
 *   2) room_members for those room IDs
 *   3) profiles for all referenced user IDs (hosts + members)
 *
 * RLS: study_rooms SELECT is `using: true` and room_members SELECT is
 * `using: true`, so this works without service-role bypass. Profiles
 * SELECT is also open. Three round-trips total — does NOT scale per-
 * room, which is the point.
 */
export async function getActiveRooms(): Promise<ActiveRoom[]> {
  const uid = await userId();

  const { data: rooms, error } = await sb()
    .from('study_rooms')
    .select('id, host_user_id, document_name, status, max_members, expires_at, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) { console.error('[DB] getActiveRooms rooms error:', error.message); return []; }
  if (!rooms?.length) return [];

  const roomIds = rooms.map((r) => r.id as string);

  const { data: memberships } = await sb()
    .from('room_members')
    .select('room_id, user_id')
    .in('room_id', roomIds);

  const userIds = new Set<string>();
  for (const r of rooms) userIds.add(r.host_user_id as string);
  for (const m of (memberships ?? []) as Array<{ room_id: string; user_id: string }>) {
    userIds.add(m.user_id);
  }

  const { data: profiles } = userIds.size
    ? await sb()
        .from('profiles')
        .select('id, username, avatar_url, is_vip')
        .in('id', [...userIds])
    : { data: [] as Array<{ id: string; username: string | null; avatar_url: string | null; is_vip: boolean }> };

  const profileMap = new Map<string, ActiveRoomMember>(
    (profiles ?? []).map((p) => [p.id as string, {
      userId:    p.id as string,
      username:  (p.username  as string | null) ?? null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      isVip:     !!p.is_vip,
    }]),
  );

  // Group memberships by room id (preserve any natural ordering — first 6 = avatar stack).
  const memberMap = new Map<string, string[]>();
  for (const m of (memberships ?? []) as Array<{ room_id: string; user_id: string }>) {
    const arr = memberMap.get(m.room_id) ?? [];
    arr.push(m.user_id);
    memberMap.set(m.room_id, arr);
  }

  return rooms.map((r) => {
    const ids = memberMap.get(r.id as string) ?? [];
    const members = ids.slice(0, 6)
      .map((id) => profileMap.get(id))
      .filter((m): m is ActiveRoomMember => !!m);
    return {
      id:           r.id as string,
      hostUserId:   r.host_user_id as string,
      documentName: r.document_name as string,
      status:       ((r.status as string | null) ?? 'active') as 'active' | 'closed',
      maxMembers:   (r.max_members as number | null) ?? 10,
      expiresAt:    (r.expires_at as string | null) ?? null,
      createdAt:    r.created_at as string,
      host:         profileMap.get(r.host_user_id as string) ?? null,
      memberCount:  ids.length,
      members,
      myMembership: uid ? ids.includes(uid) : false,
    };
  });
}

