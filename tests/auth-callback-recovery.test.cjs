const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function mount(t, overrides = {}) {
  const harness = createHookHarness();
  const previous = { window: global.window, localStorage: global.localStorage };
  const destinations = [];
  global.window = { location: { search: '?code=one-use&redirect=%2Flibrary', replace: url => destinations.push(url) } };
  global.localStorage = { getItem: () => null };
  t.after(() => {
    harness.unmount();
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete global[key]; else global[key] = previous[key];
    }
  });
  const jsx = (type, props) => ({ type, props });
  const { default: Page } = loadSource('src/app/auth/callback/page.tsx', {
    react: harness.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/supabase/client': { createClient: () => ({ auth: {
      initialize: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: 'synthetic' } }, error: null }),
      ...overrides.auth,
    } }) },
    '@/lib/supabase/db': {
      ensureProfile: async () => {}, ensureReferralCode: async () => null,
      processReferral: async () => {}, ...overrides.db,
    },
  });
  return { render: () => nodes(harness.render(Page)), destinations, unmount: harness.unmount };
}

test('callback exposes profile failure and retries without exchanging the one-use code again', async t => {
  let attempts = 0;
  const app = mount(t, { db: { ensureProfile: async () => {
    if (++attempts === 1) throw new Error('synthetic profile unavailable');
  } } });
  app.render(); await settle();
  let tree = app.render();
  assert.ok(tree.some(n => n.props?.role === 'alert'), 'failure must replace endless spinner with recovery');
  assert.deepEqual(app.destinations, []);
  const retry = tree.find(n => n.type === 'button' && n.props.children === 'Try again');
  assert.ok(retry, 'retry must be actionable');
  retry.props.onClick(); app.render(); await settle(); app.render();
  assert.equal(attempts, 2);
  assert.deepEqual(app.destinations, ['/library']);
});

test('unavailable optional referral storage does not block a verified callback', async t => {
  const app = mount(t);
  global.localStorage.getItem = () => { throw new Error('storage denied'); };
  app.render(); await settle(); app.render();
  assert.deepEqual(app.destinations, ['/library']);
});

test('unmounted callback cannot redirect after delayed authentication', async t => {
  let finish;
  const app = mount(t, { auth: { initialize: () => new Promise(resolve => { finish = resolve; }) } });
  app.render(); app.unmount(); finish({ error: null }); await settle();
  assert.deepEqual(app.destinations, []);
});

test('callback rejects invalid initialization without running profile setup', async t => {
  let profiles = 0;
  const app = mount(t, { auth: { initialize: async () => ({ error: new Error('expired') }) },
    db: { ensureProfile: async () => { profiles++; } } });
  app.render(); await settle(); app.render();
  assert.deepEqual(app.destinations, ['/login?verification=failed']);
  assert.equal(profiles, 0);
});

for (const method of ['ensureReferralCode', 'processReferral']) {
  test(`optional ${method} failure does not block authenticated navigation`, async t => {
    const app = mount(t, { db: { [method]: async () => { throw new Error('referral unavailable'); } } });
    global.localStorage = { getItem: () => 'PENDING', removeItem() {} };
    app.render(); await settle(); app.render();
    assert.deepEqual(app.destinations, ['/library']);
  });
}

test('unmounted callback cannot redirect or process referrals after delayed profile setup', async t => {
  let finish, referrals = 0;
  const app = mount(t, { db: {
    ensureProfile: () => new Promise(resolve => { finish = resolve; }),
    ensureReferralCode: async () => { referrals++; },
  } });
  app.render(); await settle(); app.unmount(); finish(); await settle();
  assert.deepEqual(app.destinations, []);
  assert.equal(referrals, 0);
});
