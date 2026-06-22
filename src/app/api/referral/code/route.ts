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
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
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
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: existing } = await admin
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle();
  if (existing?.referral_code) {
    return NextResponse.json({ referralCode: existing.referral_code as string });
  }

  const code = makeReferralCode(userId);
  const { error } = await admin
    .from('profiles')
    .update({ referral_code: code })
    .eq('id', userId);
  if (error) {
    console.error('[api/referral/code] update error:', error.message);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  return NextResponse.json({ referralCode: code });
}
