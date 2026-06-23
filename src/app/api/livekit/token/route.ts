import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json({ error: 'Voice chat not configured' }, { status: 503 });
  }

  // Verify the caller is an authenticated Supabase user
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await sb.auth.getUser(bearer);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let roomId: string, identity: string, name: string;
  try {
    ({ roomId, identity, name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!roomId || !identity) {
    return NextResponse.json({ error: 'Missing roomId or identity' }, { status: 400 });
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
  const { data: membership } = await admin
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this room' }, { status: 403 });
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: name ?? identity,
    ttl: '4h',
  });
  at.addGrant({ roomJoin: true, room: roomId, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await at.toJwt(), url: LIVEKIT_URL });
}
