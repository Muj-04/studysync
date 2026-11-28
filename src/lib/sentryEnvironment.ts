/**
 * Sentry environment name: Vercel's deployment target (production / preview /
 * development) so preview errors are not reported as production. Server code
 * sees VERCEL_ENV; the browser bundle sees NEXT_PUBLIC_VERCEL_ENV (Vercel's
 * system variable). Falls back to NODE_ENV for local runs.
 */
export function sentryEnvironment(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV || env.NODE_ENV || 'development';
}

/** Sentry only sends when a DSN is configured; without one every call is a no-op. */
export function sentryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_SENTRY_DSN);
}
