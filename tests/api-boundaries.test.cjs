const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const json = (body, options) => ({ body, status: options?.status ?? 200 });
const mocks = { 'next/server': { NextResponse: { json } }, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) } }) } };
const request = body => new Request('http://localhost/api', { method: 'POST', headers: { authorization: 'Bearer test' }, body });
test('checkout rejects malformed JSON and non-object input as client errors', async () => {
  const { POST } = loadSource('src/app/api/stripe/checkout/route.ts', mocks);
  for (const body of ['{', 'null', '[]']) assert.equal((await POST(request(body))).status, 400);
});
test('checkout rejects inherited object property names as plan/cycle', async () => {
  const { POST } = loadSource('src/app/api/stripe/checkout/route.ts', mocks);
  assert.equal((await POST(request('{"plan":"__proto__","billing":"toString"}'))).status, 400);
});
test('room leave rejects array-coerced UUIDs before authentication', async () => {
  const { POST } = loadSource('src/app/api/room/leave/route.ts', mocks);
  assert.equal((await POST(request('{"roomId":["11111111-1111-4111-8111-111111111111"]}'))).status, 400);
});
test('debug error endpoint is unavailable in production', () => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { const { GET } = loadSource('src/app/api/sentry-example-api/route.ts', { ...mocks, '@sentry/nextjs': { logger: { info: () => assert.fail('must not log') } } }); assert.equal(GET().status, 404); }
  finally { process.env.NODE_ENV = old; }
});

test('body reader bounds streamed bytes without trusting content-length and cancels oversized streams', async () => {
  const { readJsonObject } = loadSource('src/lib/api/request.ts', mocks);
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new TextEncoder().encode('é'.repeat(3000))); }, cancel() { cancelled = true; } });
  const req = new Request('http://localhost', { method: 'POST', body, duplex: 'half' });
  await assert.rejects(readJsonObject(req), error => error.status === 413);
  assert.equal(cancelled, true);
  await assert.rejects(readJsonObject(request('null')), error => error.status === 400);
  assert.deepEqual(await readJsonObject(request('{"ok":true}')), { ok: true });
});

test('all JSON body routes reject oversized requests without mutations', async () => {
  const old = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'test';
  const keys = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'];
  const prior = keys.map(k => process.env[k]); keys.forEach(k => { process.env[k] = 'test'; });
  const admin = { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'free' } }) }) }) }) };
  const local = { ...mocks, '@supabase/supabase-js': { createClient: () => admin }, '@anthropic-ai/sdk': { default: class {} } };
  try {
    for (const route of ['ai', 'referral/process', 'stripe/checkout', 'livekit/token', 'room/leave']) {
      const { POST } = loadSource(`src/app/api/${route}/route.ts`, local);
      assert.equal((await POST(request(JSON.stringify({ text: 'x'.repeat(70000) })))).status, 413, route);
    }
  } finally {
    if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old;
    keys.forEach((k, i) => { if (prior[i] === undefined) delete process.env[k]; else process.env[k] = prior[i]; });
  }
});

test('LiveKit validates fields, caller identity and membership before signing tokens', async () => {
  const keys = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'];
  const prior = keys.map(k => process.env[k]); keys.forEach(k => { process.env[k] = 'test'; });
  const uid = '11111111-1111-4111-8111-111111111111';
  let membership = null, queryError = null, signed = 0;
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: membership, error: queryError }) };
  const { POST } = loadSource('src/app/api/livekit/token/route.ts', { ...mocks,
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: uid } } }) }, from: () => query }) },
    'livekit-server-sdk': { AccessToken: class { addGrant() {} async toJwt() { signed++; return 'signed'; } } },
  });
  const call = body => POST(request(JSON.stringify(body)));
  try {
    for (const body of [{ roomId: [uid], identity: uid }, { roomId: uid, identity: uid, name: {} }, { roomId: uid, identity: uid, name: 'x'.repeat(129) }]) assert.equal((await call(body)).status, 400);
    assert.equal((await call({ roomId: uid, identity: 'other' })).status, 403);
    assert.equal((await call({ roomId: uid, identity: uid })).status, 403);
    queryError = { message: 'private database failure' };
    const failed = await call({ roomId: uid, identity: uid }); assert.equal(failed.status, 500); assert.ok(!JSON.stringify(failed).includes('private'));
    assert.equal(signed, 0);
    queryError = null; membership = { user_id: uid };
    assert.equal((await call({ roomId: uid, identity: uid })).status, 200); assert.equal(signed, 1);
  } finally { keys.forEach((k, i) => { if (prior[i] === undefined) delete process.env[k]; else process.env[k] = prior[i]; }); }
});

test('bearer parsing handles scheme case and rejects missing or unrelated schemes', () => {
  const { bearerToken } = loadSource('src/lib/api/request.ts', mocks);
  for (const header of ['Bearer test', 'bearer test', 'BEARER test']) assert.equal(bearerToken({ headers: new Headers({ authorization: header }) }), 'test');
  for (const header of ['test', 'Basic test', 'Bearer', 'Bearer test another']) assert.equal(bearerToken({ headers: new Headers({ authorization: header }) }), null);
});

test('webhook rejects unsigned requests before reading body, and bounds signed bodies', async () => {
  const { POST } = loadSource('src/app/api/stripe/webhook/route.ts', mocks);
  assert.equal((await POST({ headers: new Headers(), get body() { assert.fail('unsigned body must not be read'); } })).status, 400);
  const req = request('x'.repeat(1024 * 1024 + 1)); req.headers.set('stripe-signature', 'fake');
  assert.equal((await POST(req)).status, 413);
});

test('referral code does not overwrite after failed reads or claim success for missing profiles', async () => {
  for (const readError of [{ message: 'offline' }, null]) {
    let writes = 0;
    const query = { select() { return this; }, eq() { return this; }, is() { return this; }, update() { writes++; return this; }, maybeSingle: async () => ({ data: null, error: readError }) };
    const { POST } = loadSource('src/app/api/referral/code/route.ts', { ...mocks, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) }, from: () => query }) } });
    const result = await POST(request('{}'));
    assert.ok(result.status >= 400);
    assert.equal(writes, 0);
  }
});

test('referral code initialization returns persisted winner and only writes an unset code', async () => {
  let reads = 0, guarded = false;
  const query = { select() { return this; }, eq() { return this; }, is(column, value) { guarded = column === 'referral_code' && value === null; return this; }, update() { return this; }, maybeSingle: async () => ({ data: ++reads === 1 ? { referral_code: null } : reads === 2 ? null : { referral_code: 'WINNER' }, error: null }) };
  const { POST } = loadSource('src/app/api/referral/code/route.ts', { ...mocks, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }) }, from: () => query }) } });
  assert.deepEqual((await POST(request('{}'))).body, { referralCode: 'WINNER' });
  assert.equal(guarded, true);
});

test('AI rejects invalid input without charging quota and hides provider failures while refunding', async () => {
  const old = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'test';
  let profileError = null, reserveCount = 0, refunds = 0;
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'free' }, error: profileError }) }) }) }),
    rpc: async name => { if (name === 'reserve_ai_request_v2') reserveCount++; if (name === 'refund_ai_request') refunds++; return { data: 'reservation', error: null }; },
  };
  const { POST } = loadSource('src/app/api/ai/route.ts', { ...mocks, '@supabase/supabase-js': { createClient: () => admin }, '@anthropic-ai/sdk': { default: class { messages = { create: async () => { throw Error('PRIVATE PROVIDER DETAIL'); } }; } } });
  try {
    for (const body of ['{', 'null', '{"action":"translate","text":"hello","language":{}}', JSON.stringify({ action: 'translate', text: 'hello', language: 'x'.repeat(101) })]) assert.equal((await POST(request(body))).status, 400);
    assert.equal(reserveCount, 0);
    profileError = { message: 'PRIVATE DATABASE DETAIL' };
    assert.equal((await POST(request('{"action":"summary","text":"hello"}'))).status, 500);
    assert.equal(reserveCount, 0);
    profileError = null;
    const failed = await POST(request('{"action":"summary","text":"hello"}'));
    assert.equal(failed.status, 500); assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
    assert.equal(reserveCount, 1); assert.equal(refunds, 1);
  } finally { if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old; }
});

test('unauthenticated privileged routes never mutate data and auth exceptions become sanitized JSON', async () => {
  const admin = { auth: { getUser: async () => ({ data: { user: null } }) }, from: () => assert.fail('must not query'), rpc: () => assert.fail('must not mutate') };
  const local = { ...mocks, '@supabase/supabase-js': { createClient: () => admin }, 'next/headers': { cookies: async () => ({ getAll: () => [] }) }, '@supabase/ssr': { createServerClient: () => admin } };
  for (const [route, body] of [['referral/process', { referralCode: 'ABC' }], ['referral/code', {}], ['room/leave', { roomId: '11111111-1111-4111-8111-111111111111' }], ['stripe/checkout', { plan: 'pro', billing: 'monthly' }]]) {
    const { POST } = loadSource(`src/app/api/${route}/route.ts`, local);
    assert.equal((await POST(request(JSON.stringify(body)))).status, 401, route);
  }
  const { POST } = loadSource('src/app/api/account/delete/route.ts', local);
  const req = request('{}'); req.headers.delete('authorization');
  assert.equal((await POST(req)).status, 401);
  const { POST: referral } = loadSource('src/app/api/referral/code/route.ts', { ...local, '@supabase/supabase-js': { createClient: () => { throw Error('PRIVATE CONFIG DETAIL'); } } });
  const failure = await referral(request('{}'));
  assert.equal(failure.status, 500); assert.ok(!JSON.stringify(failure).includes('PRIVATE'));
});

test('referral rewards and room leave derive mutation identity from verified auth', async () => {
  const calls = [];
  const uid = '11111111-1111-4111-8111-111111111111';
  const admin = { auth: { getUser: async () => ({ data: { user: { id: uid } } }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'redeem_referral' ? 'ok' : true, error: null }; } };
  const local = { ...mocks, '@supabase/supabase-js': { createClient: () => admin } };
  const old = process.env.VERCEL; delete process.env.VERCEL;
  try {
    for (const [route, body] of [['referral/process', { referralCode: 'ABC', userId: 'victim', ipAddress: '1.2.3.4' }], ['room/leave', { roomId: uid, userId: 'victim' }]]) {
      const { POST } = loadSource(`src/app/api/${route}/route.ts`, local);
      assert.equal((await POST(request(JSON.stringify(body)))).status, 200);
    }
    assert.equal(calls[0].args.p_user_id, uid); assert.equal(calls[0].args.p_ip_address, null);
    assert.equal(calls[1].args.p_user_id, uid); assert.equal(calls[1].args.p_room_id, uid);
  } finally { if (old === undefined) delete process.env.VERCEL; else process.env.VERCEL = old; }
});

test('account deletion never proceeds past billing cancellation failure and uses authenticated identity', async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldService = process.env.SUPABASE_SERVICE_ROLE_KEY, oldStripe = process.env.STRIPE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'; process.env.STRIPE_SECRET_KEY = 'test';
  let cancellationFails = true; const operations = [];
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table) {
      const result = { data: table === 'subscriptions' ? { stripe_subscription_id: 'sub_owner', status: 'active' } : [], error: null };
      return { select() { return this; }, eq(_col, value) { assert.equal(value, 'owner'); return { ...result, maybeSingle: async () => result }; } };
    },
    storage: { from: () => ({ list: async () => { operations.push('storage'); return { data: [], error: null }; }, remove: async () => assert.fail('no files to remove') }) },
    rpc: async (name, args) => { operations.push(name); assert.equal(args.p_user_id, 'owner'); return { error: null }; },
  };
  const { POST } = loadSource('src/app/api/account/delete/route.ts', { ...mocks, '@supabase/supabase-js': { createClient: () => admin }, stripe: { default: class { subscriptions = { cancel: async id => { operations.push('cancel'); assert.equal(id, 'sub_owner'); if (cancellationFails) throw Error('PRIVATE'); } }; } } });
  try {
    assert.equal((await POST(request('{"userId":"victim"}'))).status, 500); assert.deepEqual(operations, ['cancel']);
    operations.length = 0; cancellationFails = false;
    assert.equal((await POST(request('{"userId":"victim"}'))).status, 200);
    assert.equal(operations[0], 'cancel'); assert.equal(operations.at(-1), 'delete_user_account');
  } finally {
    for (const [key, value] of [['NEXT_PUBLIC_SUPABASE_URL', oldUrl], ['SUPABASE_SERVICE_ROLE_KEY', oldService], ['STRIPE_SECRET_KEY', oldStripe]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('checkout passes verified identity and validated product to billing coordination', async () => {
  let captured;
  const { POST } = loadSource('src/app/api/stripe/checkout/route.ts', { ...mocks,
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner', email: 'owner@example.invalid' } } }) } }) },
    stripe: { default: class {} },
    '@/lib/billing/checkout': { prepareCheckout: async (_admin, _stripe, user, plan, billing) => { captured = { user, plan, billing }; return { url: 'https://checkout.stripe.com/existing' }; } },
  });
  const req = request('{"plan":"pro","billing":"yearly","userId":"victim","email":"victim@example.invalid"}');
  req.nextUrl = new URL('https://example.invalid');
  assert.equal((await POST(req)).status, 200);
  assert.deepEqual(captured, { user: { id: 'owner', email: 'owner@example.invalid' }, plan: 'pro', billing: 'yearly' });
});
