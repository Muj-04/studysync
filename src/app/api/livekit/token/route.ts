import { apiErrorResponse, bearerToken, readJsonObject, isUuid } from '@/lib/api/request';
import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try { return await handlePost(req); } catch (error) { return apiErrorResponse(error); }
}

async function handlePost(req: NextRequest) {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json({ error: 'Voice chat not configured' }, { status: 503 });
  }

  // Verify the caller is an authenticated Supabase user
  const bearer = bearerToken(req);
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await sb.auth.getUser(bearer);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let roomId: unknown, identity: unknown, name: unknown;
  try {
    ({ roomId, identity, name } = await readJsonObject(req));
  } catch (error) {
    return apiErrorResponse(error);
  }

  if (!isUuid(roomId) || typeof identity !== 'string' || (name !== undefined && (typeof name !== 'string' || name.length > 128))) {
    return NextResponse.json({ error: 'Invalid roomId, identity or name' }, { status: 400 });
  }

  // identity must match the authenticated user — prevents impersonation
  if (identity !== user.id) {
    return NextResponse.json({ error: 'Identity mismatch' }, { status: 403 });
  }

  // Membership check — voice tokens are only issued to users who have
  // already joined the room. joinRoom() runs during RoomClient init
  // (RoomClient.tsx:525) so by the time useVoiceChat.join() fires this
  // request, room_members has the row. Without this check, any
  // authenticated user could mint a livekit token for any roomId after
  // enumerating study_rooms.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: membership, error: membershipError } = await admin
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: typeof name === 'string' ? name : identity,
    ttl: '4h',
  });
  at.addGrant({ roomJoin: true, room: roomId, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await at.toJwt(), url: LIVEKIT_URL });
}
