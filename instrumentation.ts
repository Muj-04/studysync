import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Reports errors thrown while rendering or handling requests (App Router,
// route handlers, server actions). A no-op when no DSN is configured.
export const onRequestError = Sentry.captureRequestError;
