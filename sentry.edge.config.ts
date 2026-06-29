// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './sentry.scrub';

Sentry.init({
  // DSN comes from env — same key the client/server configs read,
  // already set in Vercel (Preview + Production).
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV,

  // 10% trace sampling in production; off in dev. Previously 1.0.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // PII off — see sentry.server.config.ts for the same reasoning.
  sendDefaultPii: false,

  // Scrub Authorization/Cookie headers + token-shaped fields.
  beforeSend: scrubSentryEvent,
});
