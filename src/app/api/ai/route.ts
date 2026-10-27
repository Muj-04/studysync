import { AI_TEXT_LIMITS, AI_CHAT_MESSAGE_LIMIT, AI_LANGUAGE_LIMIT, AI_REQUEST_MAX_BYTES } from '@/lib/aiInputLimits';
import { apiErrorResponse, bearerToken, readJsonObject } from '@/lib/api/request';
import { reserveAiRequest, refundAiRequest, completeAiRequest } from '@/lib/aiQuota';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { PLAN_LIMITS, PLAN_LABELS, nextUpgradePlan, effectivePlanLimits, type Plan } from '@/lib/planLimits';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
  try { return await handlePost(req); } catch (error) { return apiErrorResponse(error); }
}

async function handlePost(req: NextRequest) {
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
  const bearer = bearerToken(req);
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
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('plan, is_vip')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const isVip       = profile?.is_vip ?? false;
  const plan: Plan = profile?.plan === 'pro' || profile?.plan === 'premium' ? profile.plan : 'free';
  const monthlyLimit = effectivePlanLimits(plan, isVip).aiRequestsPerMonth;

  let reservation: string | null = null;

  // Process the AI request
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 0 });
  try {
    const { action, text, language, message: chatMessage } = await readJsonObject(req, AI_REQUEST_MAX_BYTES);

    if (action !== 'chat' && (!text || typeof text !== 'string')) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const sourceText = typeof text === 'string' ? text : '';
    let prompt: string;

    if (action === 'chat') {
      if (!chatMessage || typeof chatMessage !== 'string') {
        return NextResponse.json({ error: 'Missing message' }, { status: 400 });
      }
      const pageContext = typeof text === 'string' && text.trim()
        ? `Current page content:\n${text.slice(0, AI_TEXT_LIMITS.chat)}\n\n`
        : 'No document is open.\n\n';
      prompt =
        'You are a helpful AI assistant. The user is currently studying with a PDF tool. ' +
        'Answer any question they ask — whether about the document, a general topic, math, coding, or anything else. ' +
        'If document content is provided below, use it as context when relevant, but never refuse a question just because it is off-topic.\n\n' +
        pageContext +
        `User: ${chatMessage.slice(0, AI_CHAT_MESSAGE_LIMIT)}\n\n` +
        'Guidelines:\n' +
        '- For summary requests: use bullet points starting with •\n' +
        '- For flashcard requests: format as Q: [question] / A: [answer], one per line\n' +
        '- For quiz requests: ask a question from the content\n' +
        '- Be friendly, clear, and concise';
    } else if (action === 'flashcards') {
      prompt =
        'Generate 5 to 10 flashcard question-answer pairs from the text below. ' +
        'Return ONLY a JSON array with objects containing "question" and "answer" string fields. ' +
        'No markdown fences, no extra text, just the raw JSON array.\n\n' +
        sourceText.slice(0, AI_TEXT_LIMITS.flashcards);

    } else if (action === 'summary') {
      prompt =
        'Summarize the following text in 3–5 concise bullet points. ' +
        'Return ONLY the bullet points, one per line, each starting with "• ". No headers or extra text.\n\n' +
        sourceText.slice(0, AI_TEXT_LIMITS.summary);
    } else if (action === 'translate') {
      if (typeof language !== 'string' || !language.trim() || language.length > AI_LANGUAGE_LIMIT) {
        return NextResponse.json({ error: 'Missing language' }, { status: 400 });
      }
      prompt =
        `Translate the following text to ${language}. ` +
        'Return ONLY the translation, no explanations or notes.\n\n' +
        sourceText.slice(0, AI_TEXT_LIMITS.translate);
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
        sourceText.slice(0, AI_TEXT_LIMITS.explain);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    reservation = await reserveAiRequest(admin, user.id, month, monthlyLimit);
    if (!reservation) {
      const next = nextUpgradePlan(plan);
      const upgradeHint = next ? ` Upgrade to ${PLAN_LABELS[next]} for ${PLAN_LIMITS[next].aiRequestsPerMonth} requests/month.` : '';
      return NextResponse.json({ error: `Monthly AI limit reached (${monthlyLimit}/${monthlyLimit} on ${PLAN_LABELS[plan]} plan).${upgradeHint}` }, { status: 429 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = (message.content[0] as { type: string; text: string }).text ?? '';

    // Commit quota before returning a successful response.
    await completeAiRequest(admin, reservation);

    return NextResponse.json({ result });
  } catch (err) {
    if (reservation) await refundAiRequest(admin, reservation).catch(console.error);
    return apiErrorResponse(err);
  }
}
