import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Authenticate the caller before the service-only reward transaction.
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
  try {
    const body = await req.json() as { referralCode?: string };
    referralCode = body.referralCode;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (typeof referralCode !== 'string' || !referralCode.trim() || referralCode.length > 128) {
    return NextResponse.json({ error: 'missing referralCode' }, { status: 400 });
  }

  const uid = await resolveUserId(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Vercel overwrites this header at its edge. Do not trust arbitrary proxy headers elsewhere.
  const forwarded = process.env.VERCEL === '1' ? req.headers.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
  const ipAddress = forwarded && isIP(forwarded) ? forwarded : null;
  const { data: reason, error } = await admin.rpc('redeem_referral', {
    p_user_id: uid, p_code: referralCode, p_ip_address: ipAddress,
  });
  if (error) {
    console.error('[referral] reward transaction failed:', error.message);
    return NextResponse.json({ error: 'Referral could not be processed. Please try again.' }, { status: 500 });
  }
  return NextResponse.json(reason === 'ok' ? { ok: true } : { ok: false, reason });
}
