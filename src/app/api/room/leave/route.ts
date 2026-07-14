import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * sendBeacon-friendly leave endpoint.
 *
 * The RoomClient's pagehide handler can't reliably finish a regular
 * Supabase async call before the tab is torn down (the in-flight fetch
 * gets cancelled by the browser). `navigator.sendBeacon` POSTs survive
 * unload but only with a same-origin URL and no custom headers — so we
 * authenticate via the Supabase SSR cookies (already attached because
 * sendBeacon defaults to credentials: include) and perform the row
 * delete with the service-role client. The user id used in the delete
 * comes from the verified session, never from the request body.
 */
export async function POST(req: NextRequest) {
  let roomId: string | undefined;
  try {
    const body = await req.json() as { roomId?: string };
    roomId = body.roomId;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!roomId) {
    return NextResponse.json({ error: 'missing roomId' }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) {
    return NextResponse.json({ error: 'invalid roomId' }, { status: 400 });
  }

  // Service-role client for both the auth-token validation and the
  // mutation. RoomClient now sends an explicit `Authorization: Bearer
  // <access_token>` because cookie-only auth via sendBeacon was
  // unreliable in practice (the previous fix never persisted any
  // deletes). Cookies are still accepted as a fallback in case future
  // callers use them.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  let userId: string | null = null;
  if (bearer) {
    const { data: { user } } = await admin.auth.getUser(bearer);
    userId = user?.id ?? null;
  }
  if (!userId) {
    // Fallback: cookie-bound auth (same pattern as src/proxy.ts).
    const cookieStore = await cookies();
    const sessionClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      },
    );
    const { data: { user } } = await sessionClient.auth.getUser();
    userId = user?.id ?? null;
  }
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { error: deleteError } = await admin.from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (deleteError) {
    console.error('[Room leave] member delete failed:', deleteError.message);
    return NextResponse.json({ error: 'leave failed' }, { status: 500 });
  }

  // Mirror leaveRoom()'s "last member out closes the room" behaviour.
  const { count, error: countError } = await admin.from('room_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('room_id', roomId);
  if (countError) {
    console.error('[Room leave] member count failed:', countError.message);
    return NextResponse.json({ error: 'leave verification failed' }, { status: 500 });
  }
  const wasLastMember = (count ?? 0) === 0;
  if (wasLastMember) {
    const { error: closeError } = await admin.from('study_rooms')
      .update({ status: 'closed' })
      .eq('id', roomId);
    if (closeError) {
      console.error('[Room leave] room close failed:', closeError.message);
      return NextResponse.json({ error: 'room close failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ wasLastMember });
}
