const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

test('resizing respects each panel direction, collapse thresholds, and listener cleanup', t => {
  const harness = createHookHarness();
  const previousDocument = global.document;
  const listeners = new Map();
  global.document = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => { if (listeners.get(name) === handler) listeners.delete(name); },
  };
  t.after(() => { harness.unmount(); global.document = previousDocument; });
  const { useResizablePanels } = loadSource('src/app/(app)/workspace/useResizablePanels.ts', { react: harness.react });
  let leftOpen = true, rightOpen = true;
  const setLeft = open => { leftOpen = open; };
  const setRight = open => { rightOpen = open; };
  const render = () => harness.render(() => useResizablePanels(setLeft, setRight));
  let panels = render();
  panels.startLeftDrag({ clientX: 256, preventDefault() {} });
  render();
  listeners.get('mousemove')({ clientX: 500 });
  panels = render();
  assert.equal(panels.sidebarWidth, 350);
  listeners.get('mousemove')({ clientX: 100 });
  panels = render();
  assert.equal(leftOpen, false);
  assert.equal(panels.sidebarWidth, 256);
  listeners.get('mouseup')();
  panels = render();
  assert.equal(listeners.size, 0);
  panels.startRightDrag({ clientX: 500, preventDefault() {} });
  render();
  listeners.get('mousemove')({ clientX: 450 });
  panels = render();
  assert.equal(panels.rightPanelWidth, 270);
  assert.equal(rightOpen, true);
  listeners.get('mousemove')({ clientX: 600 });
  panels = render();
  assert.equal(rightOpen, false);
  assert.equal(panels.rightPanelWidth, 220);
  harness.unmount();
  assert.equal(listeners.size, 0);
});
