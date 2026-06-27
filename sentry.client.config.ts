import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from './sentry.scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 0.5 : 0,

  // PII off — Sentry's default would attach request headers / form
  // values to events on the browser side too.
  sendDefaultPii: false,

  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'ChunkLoadError',
    'Network request failed',
    'Failed to fetch',
    'AbortError',
  ],

  // Shared scrubber — also gates on DSN being set (so local dev with
  // no DSN drops the event instead of warning).
  beforeSend: scrubSentryEvent,
});
