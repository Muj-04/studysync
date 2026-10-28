const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

function mountDrawings(values, save = async () => {}, clear = async () => {}) {
  const harness = createHookHarness();
  const { usePDFDrawings } = loadSource('src/hooks/usePDFDrawings.ts', {
    react: harness.react,
    './useClientReady': { useClientReady: () => true },
    '@/lib/storage': { KEYS: { DRAWINGS: 'drawings' }, storageGet: key => values[key], storageSet: (key, value) => { values[key] = JSON.parse(JSON.stringify(value)); return true; } },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/supabase/db': { saveDrawing: save, deleteAllDrawings: clear },
  });
  const render = () => harness.render(usePDFDrawings);
  render();
  return { harness, render };
}

test('failed drawing remains visible and stored after cloud hydration and remount', async () => {
  const values = { drawings: { 'doc:1': 'old' } };
  const mount = () => mountDrawings(values, async () => { throw Error('offline'); });
  let mounted = mount();
  await new Promise(setImmediate);
  mounted.render().saveDrawing('doc', 1, 'new local strokes');
  mounted.render();
  await new Promise(setImmediate);
  mounted.render().seedDrawings({ 'doc:1': 'old' });
  assert.equal(mounted.render().getDrawing('doc', 1), 'new local strokes');
  assert.equal(values.drawings['doc:1'], 'new local strokes');
  mounted.harness.unmount();
  mounted = mount();
  mounted.render().seedDrawings({ 'doc:1': 'old', 'doc:2': 'new cloud page' });
  const restored = mounted.render();
  assert.equal(restored.getDrawing('doc', 1), 'new local strokes');
  assert.equal(restored.getDrawing('doc', 2), 'new cloud page');
});

const { documentDomainFixture } = require('./document-domain-fixture.cjs');
test('drawing database errors reject rather than acknowledging lost strokes', async () => {
  const h=documentDomainFixture();await h.prepare('doc','drawings');h.setFailure('offline');
  await assert.rejects(h.api.saveDrawing('doc','1','new'),/offline/);
});
test('clear drawings waits for an earlier save so old strokes cannot reappear', async () => {
  const h=documentDomainFixture();await h.prepare('doc','drawings',[{page_key:'1',canvas_data:'old'}]);
  let release;h.setGate(new Promise(resolve=>release=resolve));
  const save=h.api.saveDrawing('doc','1','new');await new Promise(setImmediate);
  const clear=h.api.deleteAllDrawings('doc');await new Promise(setImmediate);
  assert.equal(h.calls.length,1);release();await Promise.all([save,clear]);
  assert.deepEqual(h.calls.at(-1).args.p_rows,[]);
});

test('an older successful save cannot acknowledge a newer failed edit', async () => {
  const values = { drawings: {} };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const mounted = mountDrawings(values, async (_doc, _page, data) => {
    if (data === 'first') await gate;
    else throw Error('offline');
  });
  await new Promise(setImmediate);
  mounted.render().saveDrawing('doc', 1, 'first');
  mounted.render().saveDrawing('doc', 1, 'second');
  mounted.render();
  release();
  await new Promise(setImmediate);
  mounted.harness.unmount();
  const reopened = mountDrawings(values);
  reopened.render().seedDrawings({ 'doc:1': 'first' });
  assert.equal(reopened.render().getDrawing('doc', 1), 'second');
});

test('acknowledged drawings allow newer cloud versions after remount', async () => {
  const values = { drawings: {} };
  const mounted = mountDrawings(values);
  await new Promise(setImmediate);
  mounted.render().saveDrawing('doc', 1, 'saved');
  mounted.render();
  await new Promise(setImmediate);
  mounted.harness.unmount();
  const reopened = mountDrawings(values);
  reopened.render().seedDrawings({ 'doc:1': 'newer cloud' });
  assert.equal(reopened.render().getDrawing('doc', 1), 'newer cloud');
});

test('failed clear keeps local deletion when cloud still has old drawings', async () => {
  const values = { drawings: { 'doc:1': 'old' } };
  const mounted = mountDrawings(values, async () => {}, async () => { throw Error('offline'); });
  await new Promise(setImmediate);
  mounted.render().clearAllDrawings('doc');
  mounted.render();
  await new Promise(setImmediate);
  mounted.harness.unmount();
  const reopened = mountDrawings(values);
  reopened.render().seedDrawings({ 'doc:1': 'old' });
  assert.equal(reopened.render().getDrawing('doc', 1), undefined);
});

test('an unmounted workspace cannot acknowledge a newer workspace edit', async () => {
  const values = { drawings: {} };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = mountDrawings(values, () => gate);
  await new Promise(setImmediate);
  first.render().saveDrawing('doc', 1, 'first');
  first.render();
  first.harness.unmount();
  const second = mountDrawings(values, async () => { throw Error('offline'); });
  await new Promise(setImmediate);
  second.render().saveDrawing('doc', 1, 'second');
  second.render();
  release();
  await new Promise(setImmediate);
  second.harness.unmount();
  const third = mountDrawings(values);
  third.render().seedDrawings({ 'doc:1': 'first' });
  assert.equal(third.render().getDrawing('doc', 1), 'second');
});

test('clear before the initial fetch completes rejects its stale drawing snapshot', async () => {
  const values = { drawings: {} };
  const mounted = mountDrawings(values);
  await new Promise(setImmediate);
  mounted.render().clearAllDrawings('doc');
  mounted.render();
  await new Promise(setImmediate);
  mounted.render().seedDrawings({ 'doc:1': 'stale fetched strokes', 'other:1': 'unrelated' });
  const hook = mounted.render();
  assert.equal(hook.getDrawing('doc', 1), undefined);
  assert.equal(hook.getDrawing('other', 1), 'unrelated');
});
