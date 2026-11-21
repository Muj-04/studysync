// Reset links from the email template carry ?token_hash=&type=recovery, so they work
// on any device or browser. PKCE ?code= links need the requesting browser's verifier.
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

function mount(t, href, verifyResult) {
  const harness = createHookHarness();
  const previous = global.window;
  const history = [];
  global.window = {
    location: { href, replace() {} },
    history: { replaceState: (_s, _t, url) => history.push(url) },
    setTimeout, clearTimeout,
  };
  t.after(() => { harness.unmount(); if (previous === undefined) delete global.window; else global.window = previous; });
  const calls = [];
  const auth = {
    verifyOtp: async args => { calls.push(['verifyOtp', args]); return verifyResult; },
    onAuthStateChange: () => { calls.push(['onAuthStateChange']); return { data: { subscription: { unsubscribe() {} } } }; },
    initialize: async () => { calls.push(['initialize']); return { error: null }; },
    getSession: async () => ({ data: { session: null }, error: null }),
  };
  const jsx = (type, props) => ({ type, props });
  const { default: Page } = loadSource('src/app/reset-password/page.tsx', {
    react: harness.react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/image': { default: () => null },
    'next/link': { default: () => null },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    './reset-password.module.css': { default: {} },
    '@/lib/supabase/client': { createClient: () => ({ auth }) },
  });
  return { render: () => nodes(harness.render(Page)), calls, history };
}

test('token_hash recovery link verifies without a PKCE verifier and shows the form', async t => {
  const page = mount(t, 'https://study.example/reset-password?token_hash=abc123&type=recovery',
    { data: { session: { user: {} } }, error: null });
  page.render(); await settle(); await settle();
  assert.deepEqual(page.calls, [['verifyOtp', { token_hash: 'abc123', type: 'recovery' }]],
    'must not fall back to PKCE initialization');
  assert.deepEqual(page.history, ['/reset-password'], 'one-time token is removed from the address bar');
  assert.ok(page.render().some(n => n.props?.id === 'new-password'), 'password form is shown');
});

test('a used or expired token_hash shows the expired screen', async t => {
  const page = mount(t, 'https://study.example/reset-password?token_hash=used&type=recovery',
    { data: { session: null }, error: { message: 'Email link is invalid or has expired' } });
  page.render(); await settle(); await settle();
  const tree = page.render();
  assert.equal(tree.some(n => n.props?.id === 'new-password'), false);
  assert.ok(tree.some(n => n.props?.children === 'Link expired'));
});

test('token_hash without type=recovery is not treated as a reset link', async t => {
  const page = mount(t, 'https://study.example/reset-password?token_hash=abc123&type=signup',
    { data: { session: {} }, error: null });
  page.render(); await settle(); await settle();
  assert.equal(page.calls.some(c => c[0] === 'verifyOtp'), false);
});
