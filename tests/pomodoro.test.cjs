const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
function setup(t) {
  const harness = createHookHarness(); let interval; let bells = 0;
  t.mock.method(global, 'setInterval', fn => { interval = fn; return 1; });
  t.mock.method(global, 'clearInterval', () => { interval = undefined; });
  const previous = global.window;
  global.window = { AudioContext: class { constructor() { bells++; throw Error('No audio in test'); } } };
  t.after(() => { harness.unmount(); global.window = previous; });
  const { usePomodoro } = loadSource('src/hooks/usePomodoro.ts', {
    react: { ...harness.react, useCallback(fn, deps) {
      const ref = harness.react.useRef();
      if (!ref.current || deps.some((value, i) => value !== ref.current.deps[i])) ref.current = { fn, deps };
      return ref.current.fn;
    }, useState(initial) {
      const [value, set] = harness.react.useState(initial);
      return [value, update => set(typeof update === 'function' ? previous => { update(previous); return update(previous); } : update)];
    } },
  });
  return { render: () => harness.render(usePomodoro), tick: () => interval?.(), bells: () => bells, harness };
}
test('skipping work counts exactly one session with replayed state updaters', t => {
  const s = setup(t); s.render().skipPhase();
  let hook; for (let i = 0; i < 4; i++) hook = s.render();
  assert.equal(hook.sessions, 1); assert.equal(hook.phase, 'break'); assert.equal(hook.timeLeft, 300);
});
test('expiry rings once and prepares the full next phase without nested updates', t => {
  const s = setup(t); s.render().start();
  for (let i = 0; i < 1500; i++) { s.tick(); s.render(); }
  let hook; for (let i = 0; i < 4; i++) hook = s.render();
  assert.equal(s.bells(), 1); assert.equal(hook.sessions, 1); assert.equal(hook.phase, 'break');
  assert.equal(hook.timeLeft, 300); assert.equal(hook.running, false);
});
