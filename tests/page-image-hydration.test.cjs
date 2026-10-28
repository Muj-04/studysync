const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function mount(values, save) {
  const harness = createHookHarness();
  const { usePDFPageImages } = loadSource('src/hooks/usePDFPageImages.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { PAGE_IMAGES: 'images' }, storageGet: key => values[key] ?? null, storageSet: (key, value) => { values[key] = JSON.parse(JSON.stringify(value)); return true; } },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
    '@/lib/supabase/db': { savePageImages: save },
  });
  const render = () => harness.render(usePDFPageImages);
  render();
  return { render, harness };
}

function failingService() {
  return loadSource('src/lib/supabase/documentAnnotations.ts', {
    './dbShared': { userId: async () => 'owner', ensureDoc: async () => {}, sb: () => ({
      from: () => ({ upsert: async () => ({ error: { message: 'offline' } }) }),
    }) },
  });
}

test('failed image edits survive stale remote hydration and remount', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = { images: { doc: { 1: [{ id: 'image', x: 1 }] } } };
  const { savePageImages } = failingService();
  let state = mount(values, savePageImages);
  state.render().setPageImages('doc', 1, [{ id: 'image', x: 99 }]);
  state.render();
  t.mock.timers.tick(600); await tick();
  state.render().seedPageImages('doc', { 1: [{ id: 'image', x: 1 }] });
  assert.equal(state.render().getPageImages('doc', 1)[0].x, 99);
  assert.equal(values.images.doc[1][0].x, 99);
  state.harness.unmount();
  state = mount(values, savePageImages);
  state.render().seedPageImages('doc', { 1: [{ id: 'image', x: 1 }], 2: [{ id: 'cloud-only' }] });
  assert.equal(state.render().getPageImages('doc', 1)[0].x, 99);
  assert.equal(state.render().getPageImages('doc', 2)[0].id, 'cloud-only');
  state.harness.unmount();
});

test('image save service rejects returned database errors', async () => {
  await assert.rejects(failingService().savePageImages('doc', 1, []), /offline/);
});

test('failed image removal stays removed after stale hydration', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = { images: { doc: { 1: [{ id: 'remove' }] } } };
  let state = mount(values, failingService().savePageImages);
  state.render().loadLocalPageImages('doc');
  state.render().deletePageImage('doc', 1, 'remove');
  state.render();
  t.mock.timers.tick(600); await tick();
  state.harness.unmount();
  state = mount(values, async () => {});
  state.render().seedPageImages('doc', { 1: [{ id: 'remove' }] });
  assert.deepEqual(state.render().getPageImages('doc', 1), []);
  state.harness.unmount();
});

test('a cloud response during debounce cannot replace an image edit', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = { images: {} };
  const state = mount(values, async () => {});
  state.render().setPageImages('doc', 1, [{ id: 'new' }]);
  state.render().seedPageImages('doc', { 1: [{ id: 'old' }] });
  assert.deepEqual(state.render().getPageImages('doc', 1), [{ id: 'new' }]);
  state.harness.unmount();
});

test('acknowledged image edits allow newer cloud versions after remount', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = { images: {} };
  let state = mount(values, async () => {});
  state.render().setPageImages('doc', 1, [{ id: 'saved' }]);
  state.render();
  t.mock.timers.tick(600); await tick();
  state.harness.unmount();
  state = mount(values, async () => {});
  state.render().seedPageImages('doc', { 1: [{ id: 'newer-cloud' }] });
  assert.deepEqual(state.render().getPageImages('doc', 1), [{ id: 'newer-cloud' }]);
  state.harness.unmount();
});

test('an old mounted save cannot acknowledge a newer failed image edit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = { images: {} };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let state = mount(values, () => gate);
  state.render().setPageImages('doc', 1, [{ id: 'first' }]);
  state.render();
  t.mock.timers.tick(600); await tick();
  state.harness.unmount();
  state = mount(values, failingService().savePageImages);
  state.render().setPageImages('doc', 1, [{ id: 'second' }]);
  state.render();
  t.mock.timers.tick(600); await tick();
  release(); await tick();
  state.harness.unmount();
  state = mount(values, async () => {});
  state.render().seedPageImages('doc', { 1: [{ id: 'first' }] });
  assert.deepEqual(state.render().getPageImages('doc', 1), [{ id: 'second' }]);
  state.harness.unmount();
});

test('library deletion removes only that document image pending markers', async () => {
  const values = { studysync_page_images_pending: ['doc:1', 'doc:2', 'other:1'] };
  const { KEYS } = loadSource('src/lib/storage.ts');
  const { deleteLocalDocument } = loadSource('src/lib/documentLocalData.ts', {
    './pdfStore': { deletePdfBlob: async () => {} },
    './storage': { KEYS, storageGet: key => values[key] ?? null, storageSet: (key, value) => { values[key] = value; return true; } },
  });
  await deleteLocalDocument('doc');
  assert.deepEqual(values.studysync_page_images_pending, ['other:1']);
});
