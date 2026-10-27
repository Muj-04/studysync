const test = require('node:test');
const assert = require('node:assert/strict');
const { runProbe } = require('../scripts/auth-abuse-check.cjs');
const base = { target: 'https://xokiiepdpjvqnpzwmbtb.supabase.co', apiKey: 'sb_publishable_test', stagingConfirmed: true };
const response = (status, code = 'captcha_failed') => new Response(JSON.stringify({ code, message: 'DO_NOT_PRINT', access_token: 'DO_NOT_PRINT' }), { status });
const noWait = async () => {};

test('only the exact staging HTTPS origin is allowed; no requests on invalid config', async () => {
  for (const target of ['http://xokiiepdpjvqnpzwmbtb.supabase.co', 'https://prod.supabase.co', base.target + '.evil.test', base.target + '/auth', base.target + ':444', 'https://user@xokiiepdpjvqnpzwmbtb.supabase.co', base.target + '?x=1']) {
    await assert.rejects(runProbe({ ...base, target }, { fetch: () => assert.fail('network forbidden') }));
  }
  for (const options of [{ stagingConfirmed: false }, { apiKey: 'sb_secret_wrong' }, { mode: 'rate-limit', count: 41 }, { mode: 'rate-limit', count: 0 }, { mode: 'rate-limit', count: 1.5 }, { intervalMs: 999 }, { concurrency: 2 }, { email: 'real@example.com' }]) {
    await assert.rejects(runProbe({ ...base, ...options }, { fetch: () => assert.fail('network forbidden') }));
  }
});

test('CAPTCHA uses only two synthetic password probes, omits then invalidates token, never follows redirects', async () => {
  const requests = [];
  const waits = [];
  const result = await runProbe(base, { sleep: async ms => waits.push(ms), fetch: async (url, init) => { requests.push({ url, init }); return response(400); } });
  assert.equal(requests.length, 2);
  assert.deepEqual(waits, [1000]);
  for (const { url, init } of requests) {
    assert.equal(url, base.target + '/auth/v1/token?grant_type=password');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    const body = JSON.parse(init.body);
    assert.match(body.email, /^auth-probe-[a-f0-9-]+@example\.invalid$/);
    assert.ok(body.password.length >= 32);
  }
  assert.equal(JSON.parse(requests[0].init.body).gotrue_meta_security, undefined);
  assert.equal(JSON.parse(requests[1].init.body).gotrue_meta_security.captcha_token, 'deliberately-invalid-captcha-token');
  assert.equal(result.captchaRejectionVerified, true);
  assert.equal(result.rateLimitObserved, false);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT'));
});

test('generic invalid credentials cannot masquerade as CAPTCHA rejection', async () => {
  const result = await runProbe(base, { sleep: noWait, fetch: async () => response(400, 'invalid_credentials') });
  assert.equal(result.captchaRejectionVerified, false);
});

for (const [status, reason] of [[200, 'unexpected-success'], [302, 'redirect'], [500, 'server-error'], [429, 'rate-limited'], [401, 'unexpected-status']]) {
  test(`stops immediately on ${status} and does not disclose response content`, async () => {
    let calls = 0;
    const result = await runProbe({ ...base, mode: 'rate-limit', count: 40 }, { sleep: noWait, fetch: async () => { calls++; return response(status); } });
    assert.equal(calls, 1);
    assert.equal(result.stopReason, reason);
    assert.deepEqual(result.statusCounts, { [status]: 1 });
    assert.equal(result.rateLimitObserved, status === 429);
    assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT'));
  });
}

test('rate probe is sequential, bounded to forty and inconclusive without 429', async () => {
  let active = 0; let calls = 0;
  const result = await runProbe({ ...base, mode: 'rate-limit', count: 40 }, { sleep: noWait, fetch: async () => { active++; assert.equal(active, 1); calls++; await Promise.resolve(); active--; return response(400); } });
  assert.equal(calls, 40);
  assert.equal(result.rateLimitObserved, false);
  assert.equal(result.stopReason, 'completed');
});

test('network failure stops and strips error detail', async () => {
  let calls = 0;
  const result = await runProbe(base, { fetch: async () => { calls++; throw Error('DO_NOT_PRINT'); } });
  assert.equal(calls, 1);
  assert.equal(result.stopReason, 'network-error');
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT'));
});

test('timeout aborts an outstanding request and stops', async () => {
  let signal;
  const result = await runProbe({ ...base, timeoutMs: 1000 }, { fetch: async (_url, init) => { signal = init.signal; return new Promise(() => {}); } });
  assert.equal(result.stopReason, 'timeout');
  assert.equal(result.attempted, 1);
  assert.equal(signal.aborted, true);
});

test('malformed and oversized bodies stop instead of certifying protection', async () => {
  for (const body of ['not-json', 'x'.repeat(8193)]) {
    const result = await runProbe(base, { fetch: async () => new Response(body, { status: 400 }) });
    assert.equal(result.stopReason, 'invalid-response');
    assert.equal(result.attempted, 1);
    assert.equal(result.captchaRejectionVerified, false);
  }
});

test('CLI help and invalid flags never require credentials or expose them', () => {
  const { spawnSync } = require('node:child_process');
  const script = require.resolve('../scripts/auth-abuse-check.cjs');
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', env: {} });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /No 429 means inconclusive/);
  const refused = spawnSync(process.execPath, [script, '--target', 'https://prod.supabase.co'], { encoding: 'utf8', env: { AUTH_ABUSE_STAGING_PUBLISHABLE_KEY: 'DO_NOT_PRINT' } });
  assert.equal(refused.status, 1);
  assert.ok(!(refused.stdout + refused.stderr).includes('DO_NOT_PRINT'));
});
