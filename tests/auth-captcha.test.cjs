const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

function setup(config = { siteKey: 'real-site-key', required: true }) {
  const harness = createHookHarness();
  const { useAuthCaptcha } = loadSource('src/hooks/useAuthCaptcha.ts', { react: harness.react });
  const render = () => harness.render(() => useAuthCaptcha(config));
  let captcha = render();
  let resets = 0;
  captcha.attachWidget({ reset() { resets++; } });
  return { render, captcha, resets: () => resets, harness };
}

test('configured CAPTCHA blocks missing/expired/error tokens before calling authentication', async () => {
  const s = setup(); let calls = 0;
  const request = async () => { calls++; };
  await assert.rejects(s.captcha.run(request), /verification/i);
  s.captcha.onVerify('expired'); s.captcha.onExpire();
  await assert.rejects(s.captcha.run(request), /verification/i);
  s.captcha.onVerify('failed'); s.captcha.onError();
  await assert.rejects(s.captcha.run(request), /verification/i);
  assert.equal(calls, 0);
});

test('tokens are forwarded once and reset even when authentication rejects', async () => {
  const s = setup(); s.captcha.onVerify('one-use-token');
  let seen;
  await assert.rejects(s.captcha.run(async token => { seen = token; throw Error('network failed'); }), /network failed/);
  assert.equal(seen, 'one-use-token');
  assert.equal(s.resets(), 1);
  await assert.rejects(s.captcha.run(async () => assert.fail('reused token')), /verification/i);
  s.captcha.onVerify('new-token');
  assert.equal(await s.captcha.run(async token => token), 'new-token');
});

test('parallel submits cannot reuse a token or issue a second authentication request', async () => {
  const s = setup(); s.captcha.onVerify('single-token');
  let resolve; const pending = s.captcha.run(() => new Promise(r => { resolve = r; }));
  await assert.rejects(s.captcha.run(async () => assert.fail('concurrent request')), /progress/i);
  resolve('ok'); assert.equal(await pending, 'ok');
});

test('explicitly required CAPTCHA without a site key fails closed; unconfigured legacy mode stays compatible', async () => {
  const required = setup({ siteKey: '', required: true });
  await assert.rejects(required.captcha.run(async () => assert.fail('misconfigured protection bypassed')), /unavailable/i);
  assert.equal(required.captcha.ready, false);
  const legacy = setup({ siteKey: '', required: false });
  assert.equal(await legacy.captcha.run(async token => token ?? 'legacy'), 'legacy');
});

test('the public always-pass Turnstile key cannot enable protection in a production build', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const s = setup({ siteKey: '1x00000000000000000000AA', required: true });
    assert.equal(s.captcha.ready, false);
    await assert.rejects(s.captcha.run(async () => assert.fail('test key bypass')), /unavailable/i);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
