const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(t, save) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const harness = createHookHarness();
  const saves = []; const values = { images: {} }; let resolveAuth;
  const auth = new Promise(resolve => { resolveAuth = resolve; });
  const { usePDFPageImages } = loadSource('src/hooks/usePDFPageImages.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { PAGE_IMAGES: 'images' }, storageGet: key => values[key] ?? null, storageSet: (key, value) => { values[key] = value; return true; } },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: () => auth } }) },
    '@/lib/supabase/db': { savePageImages: async (...args) => { saves.push(args); if (save) await save(...args); } },
  });
  t.after(() => harness.unmount());
  const render = () => harness.render(usePDFPageImages);
  return { render, harness, saves, resolveAuth: () => resolveAuth({ data: { user: { id: 'user' } } }), stored: () => values.images };
}
for (const action of ['remove', 'unmount']) {
  test(`${action} cancels image saves already waiting for auth`, async t => {
    const s = setup(t); const hook = s.render();
    hook.setPageImages('doc', 1, [{ id: 'old' }]); s.render();
    t.mock.timers.tick(600); await tick();
    if (action === 'remove') { hook.removePageImagesForDocument('doc'); s.render(); } else s.harness.unmount();
    s.resolveAuth(); await tick();
    assert.deepEqual(s.saves, []);
  });
}
test('new image edit supersedes a save waiting for auth', async t => {
  const s = setup(t); const hook = s.render();
  hook.setPageImages('doc', 1, [{ id: 'old' }]); s.render(); t.mock.timers.tick(600);
  hook.setPageImages('doc', 1, [{ id: 'new' }]); s.render();
  s.resolveAuth(); await tick(); t.mock.timers.tick(600); await tick();
  assert.deepEqual(s.saves.map(args => args[2]), [[{ id: 'new' }]]);
});
test('document removal cancels only its timers and clears persisted images', async t => {
  const s = setup(t); const hook = s.render();
  hook.setPageImages('doc', 1, [{ id: 'old' }]);
  hook.setPageImages('other', 1, [{ id: 'keep' }]); s.render();
  hook.removePageImagesForDocument('doc'); s.render();
  s.resolveAuth(); t.mock.timers.tick(600); await tick();
  assert.deepEqual(s.saves.map(args => args[0]), ['other']);
  assert.equal(s.stored().doc, undefined);
});
test('writes to the same page finish in edit order even when an earlier request is slow', async t => {
  let finishFirst; const first = new Promise(resolve => { finishFirst = resolve; });
  const completed = [];
  const s = setup(t, async (_, __, images) => {
    if (images[0].id === 'old') await first;
    completed.push(images[0].id);
  });
  const hook = s.render(); s.resolveAuth();
  hook.setPageImages('doc', 1, [{ id: 'old' }]); t.mock.timers.tick(600); await tick();
  hook.setPageImages('doc', 1, [{ id: 'new' }]); t.mock.timers.tick(600); await tick();
  assert.equal(s.saves.length, 1);
  finishFirst(); await tick();
  assert.deepEqual(completed, ['old', 'new']);
});
test('rejected image save keeps local data and does not block the next edit', async t => {
  const errors = []; t.mock.method(console, 'warn', (...args) => errors.push(args));
  const s = setup(t, async (_, __, images) => { if (images[0].id === 'old') throw Error('deleted'); });
  const hook = s.render(); s.resolveAuth();
  hook.setPageImages('doc', 1, [{ id: 'old' }]); t.mock.timers.tick(600); await tick();
  assert.equal(s.stored().doc[1][0].id, 'old'); assert.equal(errors.length, 1);
  hook.setPageImages('doc', 1, [{ id: 'new' }]); t.mock.timers.tick(600); await tick();
  assert.equal(s.saves.length, 2); assert.equal(errors.length, 1);
});
test('consecutive edits and image deletion use latest state before React renders', async t => {
  const s = setup(t); const hook = s.render(); s.resolveAuth();
  hook.setPageImages('doc', 1, [{ id: 'remove' }, { id: 'keep' }]);
  hook.setPageImages('doc', 2, [{ id: 'other-page' }]);
  hook.deletePageImage('doc', 1, 'remove');
  const next = s.render();
  assert.deepEqual(next.getPageImages('doc', 1), [{ id: 'keep' }]);
  assert.deepEqual(next.getPageImages('doc', 2), [{ id: 'other-page' }]);
  t.mock.timers.tick(600); await tick();
  assert.deepEqual(s.saves.find(args => args[1] === 1)[2], [{ id: 'keep' }]);
});
