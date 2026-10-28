const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

const cases = [
  { page: 'login', method: 'signInWithPassword', button: 'Log In' },
  { page: 'register', method: 'signUp', button: 'Create Account' },
  { page: 'forgot-password', method: 'resetPasswordForEmail', button: 'Send Reset Link' },
];
const settle = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join('');
  if (tree && typeof tree === 'object') return content(tree.props?.children);
  return typeof tree === 'string' ? tree : '';
}

function mount(t, scenario, request) {
  const harness = createHookHarness();
  const previousWindow = global.window;
  const previousStorage = global.localStorage;
  const envNames = ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'NEXT_PUBLIC_AUTH_CAPTCHA_REQUIRED'];
  const previousEnv = envNames.map(name => process.env[name]);
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'synthetic-site-key';
  delete process.env.NEXT_PUBLIC_AUTH_CAPTCHA_REQUIRED;
  global.window = {
    location: { search: '', origin: 'https://study.example', replace() {} },
    setTimeout, clearTimeout,
  };
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  t.after(() => {
    harness.unmount();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousStorage === undefined) delete global.localStorage;
    else global.localStorage = previousStorage;
    envNames.forEach((name, index) => {
      if (previousEnv[index] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[index];
    });
  });
  const calls = [];
  const auth = {
    getUser: async () => ({ data: { user: null } }),
    [scenario.method]: (...args) => { calls.push(args); return request(...args); },
  };
  const AuthCaptcha = () => null;
  const jsx = (type, props) => ({ type, props });
  const { default: Page } = loadSource(`src/app/${scenario.page}/page.tsx`, {
    react: harness.react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/image': { default: () => null },
    'next/link': { default: () => null },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    './RegisterPage.module.css': { default: {} },
    './forgot-password.module.css': { default: {} },
    '@/components/AuthCaptcha': { default: AuthCaptcha },
    '@/lib/supabase/client': {
      createClient: () => ({ auth, rpc: async () => ({ data: true, error: null }) }),
    },
    '@/lib/supabase/db': {},
  });
  let tree;
  const render = () => { tree = harness.render(Page); return tree; };
  const find = predicate => nodes(tree).find(predicate);
  const widget = () => {
    const node = find(node => node.type === AuthCaptcha);
    assert.ok(node, 'the actual page renders the shared CAPTCHA control');
    return node.props.control;
  };
  const button = () => find(node => node.type === 'button' && (
    node.props.type === 'submit' || content(node) === scenario.button || content(node) === 'Creating account…'
  ));
  render();
  for (const input of nodes(tree).filter(node => node.type === 'input' && node.props.type !== 'checkbox')) {
    const label = input.props['aria-label'];
    const value = input.props.type === 'email' ? 'learner@example.com'
      : input.props.type === 'password' ? 'synthetic-password'
        : label === 'Display name' ? 'Test Learner' : 'test_learner';
    input.props.onChange({ target: { value } });
  }
  render();
  return {
    calls, render, widget, button,
    remember(value) { find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: value } }); render(); },
    solve(token) { widget().onVerify(token); render(); },
    async submit() {
      const form = find(node => node.type === 'form');
      if (form) form.props.onSubmit({ preventDefault() {} });
      else await button().props.onClick();
      await settle();
      render();
    },
    alerts: () => nodes(tree).filter(node => node.props?.role === 'alert').map(content).join(' '),
  };
}

for (const scenario of cases) {
  test(`${scenario.page}: solved CAPTCHA reaches the real auth request`, async t => {
    const app = mount(t, scenario, async () => ({ error: { message: 'Synthetic auth rejection' } }));
    app.solve('solved-token');
    assert.equal(app.button().props.disabled, false);
    await app.submit();
    assert.equal(app.calls.length, 1);
    const options = scenario.method === 'resetPasswordForEmail' ? app.calls[0][1] : app.calls[0][0].options;
    assert.equal(options.captchaToken, 'solved-token');
    assert.equal(app.widget().ready, false, 'the attempted request consumes its token');
  });

  test(`${scenario.page}: missing CAPTCHA blocks direct handler submission`, async t => {
    const app = mount(t, scenario, async () => ({ error: { message: 'Unexpected request' } }));
    assert.equal(app.button().props.disabled, true);
    // Invoke the actual handler even though the UI button is disabled.
    await app.submit();
    assert.equal(app.calls.length, 0);
    app.solve('fresh-token');
    assert.equal(app.button().props.disabled, false, 'blocked submission does not leave loading set');
  });

  test(`${scenario.page}: network rejection clears loading and allows a fresh CAPTCHA retry`, async t => {
    let attempts = 0;
    const app = mount(t, scenario, async () => {
      if (++attempts === 1) throw new Error('Synthetic network failure');
      return { error: { message: 'Synthetic auth rejection' } };
    });
    app.solve('first-token');
    await app.submit();
    assert.equal(app.calls.length, 1);
    assert.ok(app.alerts(), 'network rejection is surfaced to the user');
    assert.equal(app.widget().ready, false);
    app.solve('retry-token');
    assert.equal(app.button().props.disabled, false, 'loading clears after network rejection');
    await app.submit();
    assert.equal(app.calls.length, 2);
    const options = scenario.method === 'resetPasswordForEmail' ? app.calls[1][1] : app.calls[1][0].options;
    assert.equal(options.captchaToken, 'retry-token');
  });
}

for (const remember of [true, false]) {
  test(`successful login reaches its destination when remembered-email ${remember ? 'write' : 'removal'} fails`, async t => {
    const app = mount(t, cases[0], async () => ({ error: null }));
    app.remember(remember);
    global.window.location.search = '?redirect=%2Flibrary';
    global.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    global.localStorage.removeItem = () => { throw new Error('Storage unavailable'); };
    app.solve('one-use-token');
    await app.submit();
    assert.equal(app.calls.length, 1);
    assert.equal(global.window.location.href, '/library');
    assert.equal(app.alerts(), '', 'optional preference storage must not report failed authentication');
  });
}
