import { createClient } from '@/lib/supabase/client';

/**
 * Calls /api/ai for the four narrowly-typed actions. The /api/ai route
 * returns `{ result: string }` on success and `{ error: string }` on
 * application-level failures. But network-layer failures (proxy CORS
 * 403, Vercel edge timeout HTML, CSP block pages) can return non-JSON
 * bodies — so we read the body as text first, then try-parse for the
 * happy path and fall back to the raw text in the error path. This
 * keeps the thrown error message meaningful instead of an opaque
 * `Unexpected token 'F'` parse error.
 */

export async function callAI(action: 'summary', text: string): Promise<string>;
export async function callAI(action: 'translate', text: string, language: string): Promise<string>;
export async function callAI(action: 'explain', text: string): Promise<string>;
export async function callAI(action: 'flashcards', text: string): Promise<string>;
export async function callAI(action: string, text: string, language?: string): Promise<string> {
  return postAI({ action, text, language });
}

export async function callAIChat(pageText: string, message: string): Promise<string> {
  return postAI({ action: 'chat', text: pageText, message });
}

// ── Shared transport ──────────────────────────────────────────────────────────

async function postAI(body: Record<string, unknown>): Promise<string> {
  const { data: { session } } = await createClient().auth.getSession();
  const token = session?.access_token;

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  // Read as text so we can fall back gracefully when the response is a
  // non-JSON error page (proxy CORS 'Forbidden', Vercel edge timeout
  // HTML, etc.) instead of throwing 'Unexpected token …' on JSON.parse.
  const raw = await res.text();

  if (!res.ok) {
    // Prefer the JSON {error} shape that /api/ai itself returns; fall
    // back to the raw text body for non-JSON gateway errors.
    let detail = raw.slice(0, 200).trim();
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      detail = parsed.error ?? parsed.message ?? detail;
    } catch { /* keep the raw text */ }
    const status = res.statusText ? `${res.status} ${res.statusText}` : `${res.status}`;
    throw new Error(detail ? `${status}: ${detail}` : `AI request failed (${status})`);
  }

  // Success path — body is guaranteed JSON from /api/ai.
  const parsed = JSON.parse(raw) as { result?: string };
  window.dispatchEvent(new Event('studysync:ai-usage'));
  return (parsed.result ?? '') as string;
}
