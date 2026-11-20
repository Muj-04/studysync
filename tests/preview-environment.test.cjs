const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePreviewEnvironment: validate } = require('../scripts/check-preview-environment.cjs');
const staging = { VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: 'https://xokiiepdpjvqnpzwmbtb.supabase.co' };
test('preview rejects production/missing database and live Stripe keys', () => {
  assert.throws(() => validate({ VERCEL_ENV: 'preview' }), /staging/);
  assert.throws(() => validate({ ...staging, NEXT_PUBLIC_SUPABASE_URL: 'https://mlyvadsznvyurjakovau.supabase.co' }), /staging/);
  assert.throws(() => validate({ ...staging, STRIPE_SECRET_KEY: 'sk_live_example' }), /test mode/);
  assert.throws(() => validate({ ...staging, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_example' }), /test mode/);
  assert.doesNotThrow(() => validate({ ...staging, STRIPE_SECRET_KEY: 'sk_test_example', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_example' }));
  assert.doesNotThrow(() => validate({ VERCEL_ENV: 'production' }));
});
test('preview rejects a legacy service key from another project without printing its value', () => {
  const key = ref => `header.${Buffer.from(JSON.stringify({ref})).toString('base64url')}.signature`;
  assert.throws(() => validate({ ...staging, SUPABASE_SERVICE_ROLE_KEY: key('mlyvadsznvyurjakovau') }), /different Supabase project/);
  assert.doesNotThrow(() => validate({ ...staging, SUPABASE_SERVICE_ROLE_KEY: key('xokiiepdpjvqnpzwmbtb') }));
});
