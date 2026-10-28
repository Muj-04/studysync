const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(t, responses = []) {
  let uid = 'owner';
  const storage = new Map([['studysync_pending_ref', 'CODE']]);
  const requests = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (url === '/api/referral/code') return Response.json({ referralCode: 'OWN' });
    const response = responses.shift();
    if (typeof response === 'function') return response(options);
    if (response instanceof Error) throw response;
    return response ?? Response.json({ error: 'unavailable' }, { status: 503 });
  });
  const previous = global.localStorage;
  global.localStorage = { get length() { return storage.size; }, key: index => [...storage.keys()][index] ?? null, getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  t.after(() => { if (previous === undefined) delete global.localStorage; else global.localStorage = previous; });
  const auth = { getSession: async () => ({ data: { session: uid ? { user: { id: uid }, access_token: `token-${uid}` } : null }, error: null }) };
  const api = loadSource('src/lib/supabase/referrals.ts', { './dbShared': { sb: () => ({ auth }) } });
  return { ...api, auth, storage, requests, account(value) { uid = value; } };
}

test('HTTP503 is retryable instead of falsely acknowledging referral redemption', async t => {
  const api = setup(t);
  assert.equal(await api.processReferral('CODE', { userId: 'owner' }), 'retryable');
});

test('callback preserves a pending referral when the actual service receives HTTP503', async t => {
  const api = setup(t);
  const harness = createHookHarness(); const destinations = [];
  const oldWindow = global.window;
  global.window = { location: { search: '', replace: url => destinations.push(url) } };
  t.after(() => { harness.unmount(); if (oldWindow === undefined) delete global.window; else global.window = oldWindow; });
  const jsx = (type, props) => ({ type, props });
  const { default: Page } = loadSource('src/app/auth/callback/page.tsx', {
    react: harness.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/supabase/client': { createClient: () => ({ auth: { initialize: async () => ({ error: null }), getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) } }) },
    '@/lib/supabase/db': { ...api, ensureProfile: async () => {} },
  });
  harness.render(Page); await settle();
  assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
  assert.deepEqual(destinations, ['/workspace']);
});

for (const status of [401, 403]) {
  test(`HTTP${status} retains intent for a later authenticated retry`, async t => {
    const api = setup(t, [Response.json({}, { status }), Response.json({ ok: true })]);
    assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'deferred');
    assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
    assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'confirmed');
    assert.equal(api.storage.has('studysync_pending_ref'), false);
  });
}

test('503 retry stops after two requests and retains account-bound intent', async t => {
  const api = setup(t);
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'retryable');
  assert.equal(api.requests.length, 2);
  assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
  api.account('other');
  assert.equal(await api.recoverPendingReferral({ userId: 'other' }), 'none');
  assert.equal(api.requests.length, 2, 'a new account cannot redeem another account’s retained code');
});

test('lost response followed by already_referred is confirmed and clears matching pending intent', async t => {
  const api = setup(t, [new TypeError('lost response after commit'), Response.json({ ok: false, reason: 'already_referred' })]);
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'confirmed');
  assert.equal(api.requests.length, 2);
  assert.equal(api.storage.has('studysync_pending_ref'), false);
  assert.ok(api.requests.every(({ options }) => options.credentials === 'omit' && options.headers.Authorization === 'Bearer token-owner'));
});

for (const reason of ['no_referrer_or_self', 'ip_conflict']) {
  test(`terminal ${reason} retains code without repeating on subsequent triggers`, async t => {
    const api = setup(t, [Response.json({ ok: false, reason })]);
    assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'terminal');
    assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'terminal');
    assert.equal(api.requests.length, 1);
    assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
  });
}

for (const reason of ['email_unverified', 'referrer_too_new', 'monthly_cap']) {
  test(`temporary ${reason} defers to a future trigger rather than looping`, async t => {
    const api = setup(t, [Response.json({ ok: false, reason })]);
    assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'deferred');
    assert.equal(api.requests.length, 1);
    assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
  });
}

test('malformed successful response is not a referral acknowledgment', async t => {
  const api = setup(t, [Response.json({}), Response.json({ ok: 'true' })]);
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'retryable');
  assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
});

test('late success cannot clear a newer code or an account switch', async t => {
  const api = setup(t, [() => { api.storage.set('studysync_pending_ref', 'NEW'); return Response.json({ ok: true }); }]);
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'deferred');
  assert.equal(api.storage.get('studysync_pending_ref'), 'NEW');
  api.storage.set('studysync_pending_ref', 'CODE');
  api.requests.length = 0;
  t.mock.method(global, 'fetch', async () => { api.account('other'); return Response.json({ ok: true }); });
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'cancelled');
  assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
});

test('abort cancels a hung request promptly and keeps intent', async t => {
  const api = setup(t, [() => new Promise(() => {})]);
  const controller = new AbortController();
  const recovery = api.recoverPendingReferral({ userId: 'owner', signal: controller.signal });
  await settle(); controller.abort();
  assert.equal(await recovery, 'cancelled');
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].options.signal.aborted, true);
  assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
});

test('hung requests have a bounded retry budget and cannot clear intent after timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const api = setup(t, [() => new Promise(() => {}), () => new Promise(() => {})]);
  const recovery = api.recoverPendingReferral({ userId: 'owner' });
  await settle(); t.mock.timers.tick(2000); await settle(); t.mock.timers.tick(2000); await settle();
  assert.equal(await recovery, 'retryable');
  assert.equal(api.requests.length, 2);
  assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
});

function mountRecovery(t, api) {
  const harness = createHookHarness(); const listeners = new Map();
  let authChanged;
  api.auth.onAuthStateChange = callback => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; };
  const previous = global.window;
  global.window = { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  t.after(() => { harness.unmount(); if (previous === undefined) delete global.window; else global.window = previous; });
  const { default: Recovery } = loadSource('src/components/ReferralRecovery.tsx', {
    react: harness.react, '@/lib/supabase/client': { createClient: () => ({ auth: api.auth }) },
    '@/lib/supabase/referrals': api,
  });
  const render = () => harness.render(Recovery); render();
  return { render, unmount: harness.unmount, online: () => listeners.get('online')?.(), account: id => {
    api.account(id); authChanged(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null);
  } };
}

test('authenticated mount and reconnect recover pending referrals without retrying on render', async t => {
  const responses = [];
  const api = setup(t, responses); const app = mountRecovery(t, api);
  await settle(); assert.equal(api.requests.length, 2);
  app.render(); await settle(); assert.equal(api.requests.length, 2);
  responses.push(Response.json({ ok: true })); app.online(); await settle();
  assert.equal(api.requests.length, 3);
  assert.equal(api.storage.has('studysync_pending_ref'), false);
});

test('authenticated account change and unmount abort in-flight recovery', async t => {
  let finish;
  const api = setup(t, [() => new Promise(resolve => { finish = resolve; })]);
  const app = mountRecovery(t, api); await settle();
  app.account('other'); finish(Response.json({ ok: true })); await settle();
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].options.signal.aborted, true);
  assert.equal(api.storage.get('studysync_pending_ref'), 'CODE');
  app.unmount(); app.online(); await settle(); assert.equal(api.requests.length, 1);
});


test('account cleanup preserves bound referral intent for its owner while clearing ordinary caches', async t => {
  const responses = [];
  const api = setup(t, responses);
  await api.recoverPendingReferral({ userId: 'owner' });
  api.storage.set('studysync_drawings', 'private cached data');
  const { clearLocalUserData } = loadSource('src/lib/clearLocalUserData.ts', {
    './pendingReopenFile': { clearPendingReopenFile: async () => {} },
  });
  await clearLocalUserData();
  assert.equal(api.storage.has('studysync_drawings'), false);
  assert.equal(JSON.parse(api.storage.get('studysync_referral_recovery_owner')).code, 'CODE');
  api.account('other');
  assert.equal(await api.recoverPendingReferral({ userId: 'other' }), 'none');
  assert.equal(api.requests.length, 2);
  api.account('owner'); responses.push(Response.json({ ok: true }));
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'confirmed');
  assert.equal(api.storage.has('studysync_pending_ref'), false);
});

test('a superseded callback referral preserves the newer code and still finishes sign-in', async t => {
  const api = setup(t, [() => { api.storage.set('studysync_pending_ref', 'NEW'); return Response.json({ ok: true }); }]);
  const harness = createHookHarness(); const destinations = [];
  const oldWindow = global.window;
  global.window = { location: { search: '', replace: url => destinations.push(url) } };
  t.after(() => { harness.unmount(); if (oldWindow === undefined) delete global.window; else global.window = oldWindow; });
  const jsx = (type, props) => ({ type, props });
  const { default: Page } = loadSource('src/app/auth/callback/page.tsx', {
    react: harness.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/supabase/client': { createClient: () => ({ auth: { initialize: async () => ({ error: null }), getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) } }) },
    '@/lib/supabase/db': { ...api, ensureProfile: async () => {} },
  });
  harness.render(Page); await settle();
  assert.equal(api.storage.get('studysync_pending_ref'), 'NEW');
  assert.deepEqual(destinations, ['/workspace']);
});


test('another account’s new referral link cannot replace the first account’s durable intent', async t => {
  const responses = [];
  const api = setup(t, responses);
  await api.recoverPendingReferral({ userId: 'owner' });
  api.account('other'); api.storage.set('studysync_pending_ref', 'OTHER-CODE'); api.storage.delete('studysync_pending_ref_owner');
  await api.recoverPendingReferral({ userId: 'other' });
  assert.equal(JSON.parse(api.storage.get('studysync_referral_recovery_owner')).code, 'CODE');
  assert.equal(JSON.parse(api.storage.get('studysync_referral_recovery_other')).code, 'OTHER-CODE');
  api.account('owner'); responses.push(Response.json({ ok: true }));
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'confirmed');
  assert.equal(JSON.parse(api.requests.at(-1).options.body).referralCode, 'CODE');
  assert.equal(api.storage.get('studysync_pending_ref'), 'OTHER-CODE');
  assert.equal(api.storage.has('studysync_referral_recovery_owner'), false);
});

test('a newly selected referral link resets its terminal marker without affecting another owner', async t => {
  const responses = [Response.json({ ok: false, reason: 'ip_conflict' })];
  const api = setup(t, responses);
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'terminal');
  api.storage.delete('studysync_pending_ref_owner'); // Registering via a link explicitly stages a new intent.
  responses.push(Response.json({ ok: true }));
  assert.equal(await api.recoverPendingReferral({ userId: 'owner' }), 'confirmed');
});
