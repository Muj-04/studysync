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

test('password reset waits for sign-out then requests a fresh login document', async t => {
  const harness = createHookHarness();
  const previous = global.window;
  const destinations = [];
  global.window = { location: { href: 'https://study.example/reset-password?code=recovery', replace: url => destinations.push(url) }, setTimeout, clearTimeout };
  t.after(() => { harness.unmount(); if (previous === undefined) delete global.window; else global.window = previous; });
  let finishSignOut;
  const calls = [];
  const auth = {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: {} }, error: null }),
    updateUser: async value => { calls.push(['update', value]); return { error: null }; },
    signOut: options => { calls.push(['signOut', options]); return new Promise(resolve => { finishSignOut = resolve; }); },
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
  const render = () => nodes(harness.render(Page));
  render(); await settle();
  let tree = render();
  tree.find(n => n.props?.id === 'new-password').props.onChange({ target: { value: 'new-password' } });
  tree.find(n => n.props?.id === 'confirm-password').props.onChange({ target: { value: 'new-password' } });
  tree = render();
  tree.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await settle();
  assert.deepEqual(calls, [['update', { password: 'new-password' }], ['signOut', { scope: 'local' }]]);
  assert.equal(render().some(n => n.props?.children === 'Go to Login'), false);
  finishSignOut({ error: null }); await settle();
  const login = render().find(n => n.props?.children === 'Go to Login');
  assert.equal(login.type, 'button', 'use document navigation, not a cached Next Link');
  login.props.onClick();
  assert.deepEqual(destinations, ['/login']);
});
