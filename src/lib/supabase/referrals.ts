import { sb, userId } from './dbShared';

// ── Referrals ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://pdf-study-workspace.vercel.app';

// (makeReferralCode moved into src/app/api/referral/code/route.ts —
// the server-side route owns the derivation now that referral_code
// writes are gated by profiles_lock_privileged_cols.)

export async function ensureReferralCode(): Promise<string | null> {
  // Privileged writes to profiles.referral_code are blocked at the DB
  // level by the profiles_lock_privileged_cols trigger. Delegate to the
  // service-role-backed /api/referral/code route, which performs the
  // same ensure-or-create logic.
  const { data: { session } } = await sb().auth.getSession();
  if (!session?.access_token) return null;
  try {
    const res = await fetch('/api/referral/code', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: '{}',
    });
    if (!res.ok) return null;
    const j = await res.json() as { referralCode?: string };
    return j.referralCode ?? null;
  } catch (e) {
    console.error('[DB] ensureReferralCode fetch error:', e);
    return null;
  }
}

export async function processReferral(referralCode: string, ipAddress?: string): Promise<void> {
  // The full anti-abuse pipeline + privileged writes (profiles.plan,
  // profiles.referral_expires_at, the cross-user referrer update) now run
  // server-side under the service-role client. The trigger
  // profiles_lock_privileged_cols rejects these writes from the
  // authenticated role, so this client wrapper just forwards the inputs
  // to /api/referral/process. Same parameters, same semantics, same
  // (lack of) reward-amount changes — only the host moved.
  const { data: { session } } = await sb().auth.getSession();
  if (!session?.access_token) return;
  try {
    await fetch('/api/referral/process', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ referralCode, ipAddress }),
    });
  } catch (e) {
    console.error('[DB] processReferral fetch error:', e);
  }
}

export async function getReferralStats(): Promise<{
  referralCode: string | null;
  referralLink: string | null;
  referralCount: number;
  rewardActive: boolean;
  rewardExpiresAt: string | null;
} | null> {
  const uid = await userId(); if (!uid) return null;
  const [profileRes, countRes] = await Promise.all([
    sb().from('profiles').select('referral_code, referral_expires_at').eq('id', uid).maybeSingle(),
    sb().rpc('get_my_referral_count'),
  ]);
  const code = (profileRes.data?.referral_code as string | null) ?? null;
  const expiresAt = (profileRes.data?.referral_expires_at as string | null) ?? null;
  return {
    referralCode: code,
    referralLink: code ? `${BASE_URL}/register?ref=${code}` : null,
    referralCount: Number(countRes.data ?? 0),
    rewardActive: expiresAt ? new Date(expiresAt) > new Date() : false,
    rewardExpiresAt: expiresAt,
  };
}

