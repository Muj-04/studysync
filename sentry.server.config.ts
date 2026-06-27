// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './sentry.scrub';

Sentry.init({
  // DSN comes from env — same key the client config reads, already set
  // in Vercel (Preview + Production). Hardcoding it leaked the project
  // routing token into source control.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV,

  // 10% trace sampling in production; off in dev. Previously 1.0 which
  // shipped every request + body to Sentry.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // PII off — Sentry would otherwise auto-attach request headers
  // (including the Supabase Authorization Bearer) and request bodies.
  sendDefaultPii: false,

  // Final defense: scrub Authorization/Cookie headers + token-shaped
  // fields from anything that does make it into an event payload.
  beforeSend: scrubSentryEvent,
});
