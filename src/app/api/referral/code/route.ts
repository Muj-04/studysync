import { apiErrorResponse, bearerToken } from '@/lib/api/request';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * Ensure / fetch the caller's referral code.
 *
 * Moved from client-side after the `profiles_lock_privileged_cols` trigger
 * made `referral_code` read-only for the `authenticated` role. The body
 * preserves the original ensureReferralCode() logic — read the code, if
 * missing derive it from the user's uid, write it back — but the write is
 * now done by the service-role admin client so the trigger bypass kicks
 * in legitimately.
 *
 * Auth: Bearer first (matches /api/room/leave), cookie fallback.
 */

function makeReferralCode(uid: string): string {
  return uid.replace(/-/g, '').slice(0, 8).toUpperCase();
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const bearer = bearerToken(req);
  if (bearer) {
    // Anon-key client is sufficient to call auth.getUser(token).
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { user } } = await anon.auth.getUser(bearer);
    if (user?.id) return user.id;
  }
  const cookieStore = await cookies();
  const sessionClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await sessionClient.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest) {
  try { return await handlePost(req); } catch (error) { return apiErrorResponse(error); }
}

async function handlePost(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: existing, error: readError } = await admin
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  if (existing.referral_code) {
    return NextResponse.json({ referralCode: existing.referral_code as string });
  }

  const code = makeReferralCode(userId);
  const { data: updated, error } = await admin
    .from('profiles')
    .update({ referral_code: code })
    .eq('id', userId)
    .is('referral_code', null)
    .select('referral_code')
    .maybeSingle();
  if (error) {
    console.error('[api/referral/code] update error:', error.message);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  if (updated?.referral_code) return NextResponse.json({ referralCode: updated.referral_code });

  // Another request may have assigned the code after our read. Return the persisted value.
  const { data: current, error: currentError } = await admin.from('profiles')
    .select('referral_code').eq('id', userId).maybeSingle();
  if (currentError) throw currentError;
  if (!current?.referral_code) return NextResponse.json({ error: 'Referral code unavailable' }, { status: 409 });
  return NextResponse.json({ referralCode: current.referral_code });
}
