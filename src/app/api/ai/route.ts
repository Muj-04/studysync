import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { PLAN_LIMITS, PLAN_LABELS, nextUpgradePlan, type Plan } from '@/lib/planLimits';

export const runtime = 'nodejs';

// ── In-memory rate limiter (30 req/min per IP) ────────────────────────────────
const WINDOW_MS  = 60_000;
const MAX_REQ    = 30;
const CLEANUP_AT = 500;

interface RateBucket { count: number; windowStart: number }
const buckets = new Map<string, RateBucket>();

function ipAllowed(key: string): boolean {
  const now = Date.now();
  if (buckets.size > CLEANUP_AT) {
    for (const [k, b] of buckets) { if (now - b.windowStart > WINDOW_MS) buckets.delete(k); }
  }
  const b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) { buckets.set(key, { count: 1, windowStart: now }); return true; }
  if (b.count >= MAX_REQ) return false;
  b.count++;
  return true;
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on this server' }, { status: 503 });
  }

  // IP rate limit
  if (!ipAllowed(clientIp(req))) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  // Auth — require Bearer token to enforce per-user monthly limit
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!bearer) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const admin = getAdmin();
  const { data: { user }, error: authErr } = await admin.auth.getUser(bearer);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Per-plan monthly AI limit check
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const { data: profile } = await admin
    .from('profiles')
    .select('plan, is_vip')
    .eq('id', user.id)
    .maybeSingle();

  const isVip       = profile?.is_vip ?? false;
  const plan        = (profile?.plan ?? 'free') as Plan;
  // VIP bypasses all limits; every other plan has a specific monthly cap
  const monthlyLimit = isVip ? Infinity : PLAN_LIMITS[plan].aiRequestsPerMonth;

  const { data: usageRow } = await admin
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('month', month)
    .maybeSingle();

  const currentCount = usageRow?.count ?? 0;

  if (!isVip && currentCount >= monthlyLimit) {
    const next = nextUpgradePlan(plan);
    const upgradeHint = next
      ? ` Upgrade to ${PLAN_LABELS[next]} for ${PLAN_LIMITS[next].aiRequestsPerMonth} requests/month.`
      : '';
    return NextResponse.json(
      { error: `Monthly AI limit reached (${currentCount}/${monthlyLimit} on ${PLAN_LABELS[plan]} plan).${upgradeHint}` },
      { status: 429 },
    );
  }

  // Process the AI request
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const { action, text, language } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    let prompt: string;

    if (action === 'flashcards') {
      prompt =
        'Generate 5 to 10 flashcard question-answer pairs from the text below. ' +
        'Return ONLY a JSON array with objects containing "question" and "answer" string fields. ' +
        'No markdown fences, no extra text, just the raw JSON array.\n\n' +
        text.slice(0, 6000);

      const msg = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const raw = (msg.content[0] as { type: string; text: string }).text ?? '[]';
      // Increment counter for all non-VIP plans (fire-and-forget)
      if (!isVip) {
        admin.from('ai_usage').upsert(
          { user_id: user.id, month, count: currentCount + 1 },
          { onConflict: 'user_id,month' },
        ).then(() => {});
      }
      return NextResponse.json({ result: raw });
    } else if (action === 'summary') {
      prompt =
        'Summarize the following text in 3–5 concise bullet points. ' +
        'Return ONLY the bullet points, one per line, each starting with "• ". No headers or extra text.\n\n' +
        text.slice(0, 8000);
    } else if (action === 'translate') {
      if (!language || typeof language !== 'string') {
        return NextResponse.json({ error: 'Missing language' }, { status: 400 });
      }
      prompt =
        `Translate the following text to ${language}. ` +
        'Return ONLY the translation, no explanations or notes.\n\n' +
        text.slice(0, 2000);
    } else if (action === 'explain') {
      prompt =
        'Explain this concept in simple terms with 2-3 practical examples. Be concise and clear.\n' +
        'Return your response in exactly this format (keep the section headers exactly as shown):\n' +
        'EXPLANATION\n' +
        '[a simple 1-3 sentence explanation]\n' +
        'EXAMPLES\n' +
        '[example 1]\n' +
        '[example 2]\n' +
        '[example 3]\n\n' +
        'Concept to explain:\n' +
        text.slice(0, 2000);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = (message.content[0] as { type: string; text: string }).text ?? '';

    // Increment counter for all non-VIP plans (fire-and-forget — don't block response)
    if (!isVip) {
      admin.from('ai_usage').upsert(
        { user_id: user.id, month, count: currentCount + 1 },
        { onConflict: 'user_id,month' },
      ).then(() => {});
    }

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
