import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// ── In-memory rate limiter (30 req/min per IP) ────────────────────────────────
const WINDOW_MS  = 60_000;
const MAX_REQ    = 30;
const CLEANUP_AT = 500; // prune the map when it exceeds this size

interface RateBucket { count: number; windowStart: number }
const buckets = new Map<string, RateBucket>();

function allowed(key: string): boolean {
  const now = Date.now();

  // Periodic cleanup to prevent unbounded growth on serverless warm instances
  if (buckets.size > CLEANUP_AT) {
    for (const [k, b] of buckets) {
      if (now - b.windowStart > WINDOW_MS) buckets.delete(k);
    }
  }

  const b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= MAX_REQ) return false;
  b.count++;
  return true;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on this server' }, { status: 503 });
  }

  const ip = clientIp(req);
  if (!allowed(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const { action, text, language } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    let prompt: string;

    if (action === 'summary') {
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
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
