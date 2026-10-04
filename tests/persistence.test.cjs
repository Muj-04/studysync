const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');

test('same-resource saves retain order and recover after rejection', async () => {
  const { createSerialQueue } = loadSource('src/lib/persistence/serialQueue.ts');
  const enqueue = createSerialQueue();
  const order = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = enqueue('doc', async () => { await gate; order.push(1); throw Error('offline'); });
  const caught = assert.rejects(first, /offline/);
  const second = enqueue('doc', async () => order.push(2));
  await enqueue('other-doc', async () => order.push('other'));
  assert.deepEqual(order, ['other']);
  release();
  await Promise.all([caught, second]);
  assert.deepEqual(order, ['other', 1, 2]);
});

test('annotation saves call one atomic RPC and propagate database failures', async () => {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { error: { message: 'insert failed' } }; },
    from() { throw Error('No destructive client-side replacement permitted'); },
  };
  const { saveTextNotes } = loadSource('src/lib/supabase/annotations.ts', { './client': { createClient: () => client } });
  await assert.rejects(saveTextNotes('doc', '1', [{ id: 'note', content: 'retained' }]), /insert failed/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'replace_study_collection');
  assert.equal(calls[0].args.p_rows[0].content, 'retained');
});

test('blank-page images are included in the atomic snapshot', async () => {
  let saved;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    rpc: async (_, args) => { saved = args; return { error: null }; },
  };
  const { saveBlankPages } = loadSource('src/lib/supabase/annotations.ts', { './client': { createClient: () => client } });
  await saveBlankPages('doc', [{ id: 'blank', images: [{ id: 'image', src: 'data:image/png;base64,test' }], createdAt: 1 }]);
  assert.equal(saved.p_rows[0].images[0].id, 'image');
});

test('stale image decodes cannot overwrite another page or a new edit', () => {
  const images = [];
  const original = global.Image;
  global.Image = class { constructor() { images.push(this); } };
  try {
    const { createDrawingHydration } = loadSource('src/lib/drawingHydration.ts');
    const loader = createDrawingHydration();
    const painted = [];
    loader.load('page-a', () => painted.push('a'));
    loader.load('page-b', () => painted.push('b'));
    images[0].onload(); images[1].onload();
    assert.deepEqual(painted, ['b']);
    loader.load('late-cloud-data', () => painted.push('late'));
    loader.invalidate();
    images[2].onload();
    assert.deepEqual(painted, ['b']);
  } finally { global.Image = original; }
});

const { createHookHarness } = require('./hook-harness.cjs');

test('initial render does not overwrite stored text notes before hydration', () => {
  const harness = createHookHarness();
  const existing = { 'doc:1': [{ id: 'note', content: 'offline work' }] };
  let stored = existing;
  const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { TEXT_NOTES: 'notes' }, storageGet: () => stored, storageSet: (_, value) => { stored = value; } },
    '@/lib/supabase/db': { saveTextNotes: async () => {} },
  });
  harness.render(() => useTextNotes(null));
  assert.equal(stored, existing);
  const [notes] = harness.render(() => useTextNotes(null));
  assert.equal(notes['doc:1'][0].content, 'offline work');
  assert.equal(stored, existing);
});

test('blank-page updates sync the newest snapshot even when React queues state', async () => {
  const harness = createHookHarness();
  const snapshots = [];
  const { useBlankPages } = loadSource('src/hooks/useBlankPages.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { BLANK_PAGES: 'pages' }, storageGet: () => [{ id: 'blank', documentId: 'doc', canvasData: 'old' }], storageSet: () => true },
    '@/lib/supabase/db': { saveBlankPages: async (_, pages) => { snapshots.push(pages); } },
  });
  const hook = harness.render(useBlankPages);
  hook.updateCanvasData('blank', 'new');
  hook.updateImages('blank', [{ id: 'image' }]);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0][0].canvasData, 'new');
  assert.equal(snapshots[1][0].canvasData, 'new');
  assert.equal(snapshots[1][0].images[0].id, 'image');
  hook.removeBlankPage('blank');
  assert.deepEqual(snapshots[2], []);
});
