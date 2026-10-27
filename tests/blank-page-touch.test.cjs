const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

test('blank-page pinch permission follows tool changes with a stable zoom callback', () => {
  const harness = createHookHarness();
  const listeners = new Map();
  const container = {
    scrollLeft: 0, scrollTop: 0,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  // Mount the scroll container; canvas painting is outside this gesture test.
  const jsx = (type, props) => {
    if (type === 'div' && props.ref) props.ref.current = container;
    return { type, props };
  };
  const oldWindow = global.window;
  global.window = new EventTarget();
  const changes = [];
  const onZoomChange = value => changes.push(value);
  try {
    const { default: Canvas } = loadSource('src/components/BlankPageCanvas.tsx', {
      react: { ...harness.react, forwardRef: fn => fn, useImperativeHandle() {} },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      './TextNotesLayer': { default: () => null },
    });
    const render = tool => harness.render(() => Canvas({
      blankPage: { id: 'blank', images: [] }, tool, penType: 'normal',
      color: '#000000', strokeSize: 2, zoom: 1, onZoomChange,
    }, null));
    const touch = distance => ({
      touches: [{ clientX: -distance / 2, clientY: 0 }, { clientX: distance / 2, clientY: 0 }],
      preventDefault() {},
    });
    const pinch = () => {
      listeners.get('touchstart')(touch(100));
      listeners.get('touchmove')(touch(150));
      listeners.get('touchend')({ touches: [] });
    };
    render('pen');
    pinch();
    assert.deepEqual(changes, []);
    render('cursor');
    pinch();
    assert.deepEqual(changes, [1.5], 'switching to cursor enables pinch zoom');
    render('pen');
    pinch();
    assert.deepEqual(changes, [1.5], 'switching back to pen disables pinch zoom');
  } finally {
    harness.unmount();
    if (oldWindow === undefined) delete global.window;
    else global.window = oldWindow;
  }
});
