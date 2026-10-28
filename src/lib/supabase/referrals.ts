import { sb, userId } from './dbShared';

// ── Referrals ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://pdf-study-workspace.vercel.app';

// (makeReferralCode moved into src/app/api/referral/code/route.ts —
// the server-side route owns the derivation now that referral_code
// writes are gated by profiles_lock_privileged_cols.)

export type ReferralOutcome = 'confirmed' | 'retryable' | 'deferred' | 'terminal' | 'cancelled' | 'none';
type ReferralOptions = { userId: string; signal?: AbortSignal };
const PENDING = 'studysync_pending_ref';
const OWNER = 'studysync_pending_ref_owner';

// Include session lookup and response decoding in the deadline. Abort alone is
// insufficient when a dependency never settles (or ignores its signal).
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, parent: AbortSignal | undefined,
  fallback: () => T, milliseconds = 2000): Promise<T> {
  const controller = new AbortController();
  let finish: (value: T) => void = () => {};
  const stopped = new Promise<T>(resolve => { finish = resolve; });
  const stop = () => { controller.abort(); finish(fallback()); };
  const timer = setTimeout(stop, milliseconds);
  parent?.addEventListener('abort', stop, { once: true });
  if (parent?.aborted) stop();
  try { return await Promise.race([work(controller.signal), stopped]); }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', stop); }
}

type ReferralReply = { status: number; body: Record<string, unknown> } | 'retryable' | 'cancelled';
async function referralRequest(path: string, body: object, options: Partial<ReferralOptions>): Promise<ReferralReply> {
  return bounded<ReferralReply>(async signal => {
    try {
      const { data: { session } } = await sb().auth.getSession();
      if (signal.aborted || !session || (options.userId !== undefined && session.user.id !== options.userId)) return 'cancelled';
      const response = await fetch(path, {
        method: 'POST', credentials: 'omit', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      // Pin requests to the captured bearer: a newer cookie session must never
      // turn a failed old-account request into a different account's redemption.
      const payload = response.ok ? await response.json() : {};
      if (signal.aborted) return 'cancelled';
      return { status: response.status, body: payload && typeof payload === 'object' ? payload : {} };
    } catch { return options.signal?.aborted ? 'cancelled' : 'retryable'; }
  }, options.signal, () => options.signal?.aborted ? 'cancelled' : 'retryable');
}

export async function ensureReferralCode(options: Partial<ReferralOptions> = {}): Promise<string | null> {
  const reply = await referralRequest('/api/referral/code', {}, options);
  return typeof reply === 'object' && typeof reply.body.referralCode === 'string' ? reply.body.referralCode : null;
}

export async function processReferral(referralCode: string, options: ReferralOptions): Promise<ReferralOutcome> {
  const reply = await referralRequest('/api/referral/process', { referralCode }, options);
  if (typeof reply === 'string') return reply;
  if (reply.status >= 500 || [408, 425, 429].includes(reply.status)) return 'retryable';
  if ([401, 403].includes(reply.status)) return 'deferred'; // A refreshed session may recover.
  if (reply.status < 200 || reply.status >= 300) return 'terminal';
  if (reply.body.ok === true || (reply.body.ok === false && reply.body.reason === 'already_referred')) return 'confirmed';
  if (reply.body.ok === false && ['email_unverified', 'referrer_too_new', 'monthly_cap'].includes(String(reply.body.reason))) return 'deferred';
  if (reply.body.ok === false && ['no_referrer_or_self', 'ip_conflict'].includes(String(reply.body.reason))) return 'terminal';
  return 'retryable'; // Unknown/malformed success bodies are not acknowledgments.
}

/** Two attempts per mount/online/sign-in trigger; no polling or render loop. */
export async function recoverPendingReferral(options: ReferralOptions): Promise<ReferralOutcome> {
  return bounded<ReferralOutcome>(async signal => {
    try {
      if (signal.aborted) return 'cancelled';
      const { data: { session } } = await sb().auth.getSession();
      if (signal.aborted || !session || session.user.id !== options.userId) return 'cancelled';
      const key = `studysync_referral_recovery_${options.userId}`;
      const previous = localStorage.getItem(key);
      let intent = previous ? JSON.parse(previous) as { code: string; terminal?: boolean } : null;
      const stagedCode = localStorage.getItem(PENDING);
      const previousOwner = localStorage.getItem(OWNER);
      const owner = previousOwner ? JSON.parse(previousOwner) as { code: string; userId: string } : null;
      const ownsStaged = !!stagedCode && (!owner || owner.code !== stagedCode || owner.userId === options.userId);
      const binding = JSON.stringify({ code: stagedCode, userId: options.userId });
      if (ownsStaged) {
        // A new link supersedes only this account's intent. Another account's
        // durable entry remains available after switching back or signing in.
        if (intent?.code !== stagedCode || !owner || owner.code !== stagedCode) intent = { code: stagedCode };
        localStorage.setItem(key, JSON.stringify(intent));
        localStorage.setItem(OWNER, binding);
      }
      if (!intent || typeof intent.code !== 'string' || !intent.code) return 'none';
      if (intent.terminal) return 'terminal';
      const code = intent.code;
      const snapshot = localStorage.getItem(key);
      const superseded = () => localStorage.getItem(key) !== snapshot || (ownsStaged &&
        (localStorage.getItem(PENDING) !== code || localStorage.getItem(OWNER) !== binding));
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal.aborted) return 'cancelled';
        if (superseded()) return 'deferred';
        const outcome = await processReferral(code, { ...options, signal });
        const { data: { session: current } } = await sb().auth.getSession();
        if (signal.aborted || current?.user.id !== options.userId) return 'cancelled';
        if (superseded()) return 'deferred';
        if (outcome === 'confirmed') {
          localStorage.removeItem(key);
          if (ownsStaged) {
            localStorage.removeItem(PENDING);
            localStorage.removeItem(OWNER);
          }
        } else if (outcome === 'terminal') {
          localStorage.setItem(key, JSON.stringify({ code, terminal: true }));
        }
        if (outcome !== 'retryable') return outcome;
      }
      return 'retryable';
    } catch { return options.signal?.aborted ? 'cancelled' : 'retryable'; }
  }, options.signal, () => options.signal?.aborted ? 'cancelled' : 'retryable', 5000);
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

