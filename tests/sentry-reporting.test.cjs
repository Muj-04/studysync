// REL-01: unexpected server errors reach Sentry, environments are labelled by
// Vercel target, and everything is a safe no-op when no DSN is configured.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadSource } = require('./load-source.cjs');

const { sentryEnvironment, sentryEnabled } = loadSource('src/lib/sentryEnvironment.ts');

test('environment follows the Vercel deployment target', () => {
  assert.equal(sentryEnvironment({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }), 'preview');
  assert.equal(sentryEnvironment({ VERCEL_ENV: 'production', NODE_ENV: 'production' }), 'production');
  assert.equal(sentryEnvironment({ NEXT_PUBLIC_VERCEL_ENV: 'preview', NODE_ENV: 'production' }), 'preview', 'browser bundle');
  assert.equal(sentryEnvironment({ NODE_ENV: 'development' }), 'development');
  assert.equal(sentryEnvironment({}), 'development');
});

test('Sentry is enabled only when a DSN is set', () => {
  assert.equal(sentryEnabled({}), false);
  assert.equal(sentryEnabled({ NEXT_PUBLIC_SENTRY_DSN: '' }), false);
  assert.equal(sentryEnabled({ NEXT_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1' }), true);
});

test('all three Sentry configs use the shared enabled/environment helpers', () => {
  for (const file of ['sentry.server.config.ts', 'sentry.edge.config.ts', 'sentry.client.config.ts']) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /enabled: sentryEnabled\(\)/, file);
    assert.match(src, /environment: sentryEnvironment\(\)/, file);
    assert.doesNotMatch(src, /environment: process\.env\.NODE_ENV/, file);
  }
});

test('request errors are reported through onRequestError', () => {
  const captureRequestError = () => {};
  const mod = loadSource('instrumentation.ts', { '@sentry/nextjs': { captureRequestError } });
  assert.equal(mod.onRequestError, captureRequestError);
});

test('unexpected API errors are captured; expected client errors are not; responses stay generic', async () => {
  const captured = [];
  const { apiErrorResponse, ApiRequestError } = loadSource('src/lib/api/request.ts', {
    '@sentry/nextjs': { captureException: (e) => captured.push(e) },
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  });
  const original = console.error; console.error = () => {};
  try {
    const boom = new Error('database exploded: password=hunter2');
    const res = apiErrorResponse(boom);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' }, 'no internals leak to the client');
    assert.deepEqual(captured, [boom]);
    const bad = apiErrorResponse(new ApiRequestError('Missing text', 400));
    assert.equal(bad.status, 400);
    assert.equal(captured.length, 1, 'validation errors are not reported');
  } finally { console.error = original; }
});

test('the real SDK without a DSN accepts captures without throwing', () => {
  const Sentry = require('@sentry/nextjs');
  Sentry.init({ dsn: undefined, enabled: sentryEnabled({}) });
  assert.doesNotThrow(() => Sentry.captureException(new Error('no dsn configured')));
});
