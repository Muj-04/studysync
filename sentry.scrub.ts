import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * beforeSend hook shared by server + edge Sentry configs.
 *
 * Scrubs known token-bearing surfaces before events leave the process:
 *   - Drops the event entirely when DSN is unset (local dev) so we don't
 *     log to a wildcard endpoint.
 *   - Replaces sensitive HTTP headers (Authorization, Cookie, apikey…)
 *     with "[Filtered]". This matters because `sendDefaultPii` is now
 *     `false`, but our route handlers still attach Bearer tokens by hand
 *     in some debug logs that Sentry can pick up via breadcrumbs.
 *   - Walks request.data / extra / contexts and replaces any field whose
 *     name matches the sensitive-field pattern (token, password, secret,
 *     authorization, bearer, jwt, api[_-]?key). Recurses into nested
 *     objects/arrays.
 *
 * Intentionally conservative — false positives ("[Filtered]" appearing
 * on a benign field) are preferable to a Bearer token reaching Sentry.
 */

const SENSITIVE_HEADER = /^(authorization|cookie|set-cookie|x-supabase-auth|apikey|api[-_]?key|x-auth-token)$/i;
const SENSITIVE_FIELD  = /(token|password|secret|authorization|bearer|jwt|api[-_]?key|cookie)/i;

const FILTERED = '[Filtered]' as const;

function scrubValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrubValue);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD.test(k)) {
      out[k] = FILTERED;
    } else if (v !== null && typeof v === 'object') {
      out[k] = scrubValue(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  // Drop entirely when DSN not configured (local dev without Sentry).
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null;

  const req = event.request;
  if (req) {
    if (req.headers && typeof req.headers === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        out[k] = SENSITIVE_HEADER.test(k) ? FILTERED : String(v);
      }
      req.headers = out;
    }
    // Cookies object/string — scrap unconditionally.
    if ('cookies' in req && req.cookies) {
      (req as Record<string, unknown>).cookies = FILTERED;
    }
    if (req.data !== undefined) {
      req.data = scrubValue(req.data) as typeof req.data;
    }
    if (req.query_string && typeof req.query_string === 'object') {
      req.query_string = scrubValue(req.query_string) as typeof req.query_string;
    }
  }

  if (event.extra)    event.extra    = scrubValue(event.extra)    as typeof event.extra;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;

  return event;
}
