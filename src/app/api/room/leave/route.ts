import { apiErrorResponse, bearerToken, readJsonObject, isUuid } from '@/lib/api/request';
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
  try { return await handlePost(req); } catch (error) { return apiErrorResponse(error); }
}

async function handlePost(req: NextRequest) {
  let roomId: unknown;
  try {
    const body = await readJsonObject(req);
    roomId = body.roomId;
  } catch (error) {
    return apiErrorResponse(error);
  }
  if (!roomId) {
    return NextResponse.json({ error: 'missing roomId' }, { status: 400 });
  }
  if (!isUuid(roomId)) {
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

  const bearer = bearerToken(req);
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

  const { data: wasLastMember, error } = await admin.rpc('leave_room_atomic', {
    p_room_id: roomId, p_user_id: userId,
  });
  if (error) {
    console.error('[Room leave] transaction failed:', error.message);
    return NextResponse.json({ error: 'leave failed' }, { status: 500 });
  }
  return NextResponse.json({ wasLastMember: wasLastMember === true });
}
