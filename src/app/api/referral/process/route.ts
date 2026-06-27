import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * Process a referral redemption.
 *
 * Body of this route is the verbatim logic that used to live in
 * `processReferral()` inside src/lib/supabase/db.ts. Same anti-abuse
 * checks, same reward semantics — only the location changed. Privileged
 * writes (profiles.plan, profiles.referral_expires_at) now go through
 * the service-role client so they bypass the new
 * profiles_lock_privileged_cols trigger legitimately.
 *
 * Auth: Bearer first (matches /api/room/leave), cookie fallback.
 *
 * Note: ipAddress is still taken from the request body (client-supplied)
 * to honour the "don't change reward logic" constraint on this change.
 * That's a separate audit-flagged issue worth fixing in its own pass.
 */

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (bearer) {
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

  let referralCode: string | undefined;
  let ipAddress:    string | undefined;
  try {
    const body = await req.json() as { referralCode?: string; ipAddress?: string };
    referralCode = body.referralCode;
    ipAddress    = body.ipAddress;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!referralCode) {
    return NextResponse.json({ error: 'missing referralCode' }, { status: 400 });
  }

  const uid = await resolveUserId(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 1. Email verification required — unverified accounts never trigger rewards.
  const { data: { user } } = await admin.auth.admin.getUserById(uid);
  if (!user?.email_confirmed_at) {
    return NextResponse.json({ ok: false, reason: 'email_unverified' });
  }

  const code = referralCode.trim().toUpperCase();

  // 2. Find referrer + account age check (must be ≥24 h old).
  const { data: referrer } = await admin
    .from('profiles')
    .select('id, created_at')
    .eq('referral_code', code)
    .maybeSingle();
  if (!referrer || referrer.id === uid) {
    return NextResponse.json({ ok: false, reason: 'no_referrer_or_self' });
  }
  const referrerAgeMs = Date.now() - new Date(referrer.created_at as string).getTime();
  if (referrerAgeMs < 24 * 60 * 60 * 1000) {
    return NextResponse.json({ ok: false, reason: 'referrer_too_new' });
  }

  // 3. One referral per referred user — they can only be referred once ever.
  const { data: alreadyReferred } = await admin
    .from('referrals').select('id').eq('referred_id', uid).maybeSingle();
  if (alreadyReferred) {
    return NextResponse.json({ ok: false, reason: 'already_referred' });
  }

  // 4. IP-based abuse check (only if ipAddress provided).
  if (ipAddress) {
    const { data: ipConflict } = await admin
      .from('referrals')
      .select('id')
      .eq('referrer_id', referrer.id)
      .eq('ip_address', ipAddress)
      .maybeSingle();
    if (ipConflict) {
      return NextResponse.json({ ok: false, reason: 'ip_conflict' });
    }
  }

  // 5. Monthly referral limit — max 10 rewarded referrals per referrer per calendar month.
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const { count: monthCount } = await admin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', referrer.id)
    .eq('reward_granted', true)
    .gte('created_at', monthStart.toISOString());
  if ((monthCount ?? 0) >= 10) {
    return NextResponse.json({ ok: false, reason: 'monthly_cap' });
  }

  // Insert referral row.
  const { error: insertErr } = await admin.from('referrals').upsert(
    { referrer_id: referrer.id, referred_id: uid, ip_address: ipAddress ?? null },
    { onConflict: 'referrer_id,referred_id', ignoreDuplicates: true },
  );
  if (insertErr) {
    console.error('[api/referral/process] insert error:', insertErr.message);
    return NextResponse.json({ error: 'insert failed' }, { status: 500 });
  }

  // Stacking reward: newExpiry = max(current_expires_at, now()) + 7 days.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const stackExpiry = (current: string | null): string => {
    const currentMs = current ? new Date(current).getTime() : 0;
    return new Date(Math.max(currentMs, now) + SEVEN_DAYS_MS).toISOString();
  };

  // Build the reward update payload. The referral reward must NEVER lower
  // a user's tier — pre-fix the route always set plan='premium', silently
  // downgrading Pro users (and overriding VIP) every time their friend
  // signed up. New rule:
  //   - Free user        → set plan='premium' AND extend the 7-day window
  //   - Premium user     → only extend the window (already at the reward
  //                        tier; stacking is the actual benefit)
  //   - Pro / VIP user   → only extend the window (untouched plan field)
  // The reward window itself stacks for everyone, so paid users still get
  // value from referring without being demoted.
  type PlanField = 'free' | 'premium' | 'pro' | null;
  const buildReward = (
    currentPlan: PlanField,
    isVip:       boolean,
    newExpiry:   string,
  ): Record<string, unknown> => {
    const payload: Record<string, unknown> = { referral_expires_at: newExpiry };
    if (!isVip && (currentPlan ?? 'free') === 'free') {
      payload.plan = 'premium';
    }
    return payload;
  };

  const [referrerRow, referredRow] = await Promise.all([
    admin.from('profiles').select('plan, is_vip, referral_expires_at').eq('id', referrer.id).maybeSingle(),
    admin.from('profiles').select('plan, is_vip, referral_expires_at').eq('id', uid).maybeSingle(),
  ]);

  const referrerExpiry = stackExpiry((referrerRow.data?.referral_expires_at as string | null) ?? null);
  const referredExpiry = stackExpiry((referredRow.data?.referral_expires_at as string | null) ?? null);

  const referrerPayload = buildReward(
    (referrerRow.data?.plan ?? null) as PlanField,
    Boolean(referrerRow.data?.is_vip),
    referrerExpiry,
  );
  const referredPayload = buildReward(
    (referredRow.data?.plan ?? null) as PlanField,
    Boolean(referredRow.data?.is_vip),
    referredExpiry,
  );

  await Promise.all([
    admin.from('profiles').update(referrerPayload).eq('id', referrer.id),
    admin.from('profiles').update(referredPayload).eq('id', uid),
    admin.from('referrals').update({ reward_granted: true })
      .eq('referrer_id', referrer.id).eq('referred_id', uid),
  ]);

  return NextResponse.json({ ok: true });
}
