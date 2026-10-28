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
    from(table) { assert.equal(table, 'documents'); return { upsert: async () => ({ error: null }) }; },
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
    from: () => ({ upsert: async () => ({ error: null }) }),
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

test('drawing waits for the existing saved bitmap before accepting an edit', () => {
  const images = [];
  const original = global.Image;
  global.Image = class { constructor() { images.push(this); } };
  try {
    const { createDrawingHydration } = loadSource('src/lib/drawingHydration.ts');
    const loader = createDrawingHydration();
    const canvas = [];
    loader.load('existing strokes', () => canvas.push('existing strokes'));
    const edit = () => { if (loader.beginEdit()) canvas.push('new stroke'); };
    edit();
    assert.deepEqual(canvas, []);
    images[0].onload();
    edit();
    assert.deepEqual(canvas, ['existing strokes', 'new stroke']);
  } finally { global.Image = original; }
});

const { createHookHarness } = require('./hook-harness.cjs');

test('restoring clean text notes does not replace newer cloud notes', () => {
  const harness = createHookHarness();
  const saves = [];
  const local = { 'doc:1': [{ id: 'note', content: 'older device copy' }] };
  const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { TEXT_NOTES: 'notes' }, storageGet: key => key === 'notes' ? local : null, storageSet: () => true },
    '@/lib/supabase/db': { saveTextNotes: async (...args) => saves.push(args) },
  });
  harness.render(() => useTextNotes('owner'));
  const [notes] = harness.render(() => useTextNotes('owner'));
  assert.equal(notes['doc:1'][0].content, 'older device copy');
  assert.deepEqual(saves, []);
});

test('an edit before authentication resolves is synced when the owner arrives', async () => {
  const harness = createHookHarness();
  const values = { notes: {} };
  const saves = [];
  const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { TEXT_NOTES: 'notes' }, storageGet: key => values[key], storageSet: (key, value) => { values[key] = value; return true; } },
    '@/lib/supabase/db': { saveTextNotes: async (...args) => saves.push(args) },
  });
  harness.render(() => useTextNotes(null));
  const [, edit] = harness.render(() => useTextNotes(null));
  edit({ 'doc:1': [{ id: 'note', content: 'before auth' }] });
  harness.render(() => useTextNotes(null));
  harness.render(() => useTextNotes('owner'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saves, [['doc', '1', [{ id: 'note', content: 'before auth' }]]]);
});

test('pending notes for a locally deleted document are never reuploaded', () => {
  const harness = createHookHarness();
  const values = { notes: {}, notes_pending_owner: { 'deleted:1': [{ id: 'note', content: 'pending' }] } };
  const saves = [];
  const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { TEXT_NOTES: 'notes' }, storageGet: key => values[key], storageSet: (key, value) => { values[key] = value; return true; } },
    '@/lib/supabase/db': { saveTextNotes: async (...args) => saves.push(args) },
  });
  harness.render(() => useTextNotes('owner'));
  harness.render(() => useTextNotes('owner'));
  assert.deepEqual(saves, []);
  assert.deepEqual(values.notes_pending_owner, {});
});

test('retrying an outbox uses the latest local snapshot after an interrupted save', () => {
  const harness = createHookHarness();
  const values = { notes: { 'doc:1': [{ id: 'note', content: 'newer local edit' }] }, notes_pending_owner: { 'doc:1': [{ id: 'note', content: 'older pending edit' }] } };
  const saves = [];
  const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { TEXT_NOTES: 'notes' }, storageGet: key => values[key], storageSet: (key, value) => { values[key] = value; return true; } },
    '@/lib/supabase/db': { saveTextNotes: async (...args) => saves.push(args) },
  });
  harness.render(() => useTextNotes('owner'));
  harness.render(() => useTextNotes('owner'));
  assert.deepEqual(saves, [['doc', '1', [{ id: 'note', content: 'newer local edit' }]]]);
});

test('cloud hydration does not enqueue writes but subsequent edits do', () => {
  const harness = createHookHarness();
  const saves = [];
  const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
    react: harness.react,
    '@/lib/storage': { KEYS: { TEXT_NOTES: 'notes' }, storageGet: () => null, storageSet: () => true },
    '@/lib/supabase/db': { saveTextNotes: async (...args) => saves.push(args) },
  });
  harness.render(() => useTextNotes('owner'));
  const [, edit, seed] = harness.render(() => useTextNotes('owner'));
  assert.equal(typeof seed, 'function');
  seed({ 'doc:1': [{ id: 'note', content: 'cloud' }] });
  harness.render(() => useTextNotes('owner'));
  assert.deepEqual(saves, []);
  edit(prev => ({ ...prev, 'doc:1': [{ id: 'note', content: 'edited' }] }));
  harness.render(() => useTextNotes('owner'));
  assert.deepEqual(saves, [['doc', '1', [{ id: 'note', content: 'edited' }]]]);
});

test('failed text note edits survive remount and retry without uploading clean pages', async () => {
  const values = { notes: { 'doc:1': [{ id: 'note', content: 'old' }], 'doc:2': [{ id: 'clean', content: 'unchanged' }] } };
  let offline = true;
  const saves = [];
  const mount = () => {
    const harness = createHookHarness();
    const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
      react: harness.react,
      '@/lib/storage': { KEYS: { TEXT_NOTES: 'notes' }, storageGet: key => values[key] ?? null, storageSet: (key, value) => { values[key] = JSON.parse(JSON.stringify(value)); return true; } },
      '@/lib/supabase/db': { saveTextNotes: async (doc, page, notes) => { if (offline) throw Error('offline'); saves.push({ doc, page, notes }); } },
    });
    harness.render(() => useTextNotes('owner'));
    return { harness, render: () => harness.render(() => useTextNotes('owner')) };
  };
  const first = mount();
  const [, edit] = first.render();
  edit(prev => ({ ...prev, 'doc:1': [{ id: 'note', content: 'offline edit' }] }));
  const originalError = console.error;
  console.error = () => {};
  try { first.render(); await new Promise(resolve => setImmediate(resolve)); }
  finally { console.error = originalError; }
  first.harness.unmount();
  offline = false;
  const second = mount();
  second.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saves, [{ doc: 'doc', page: '1', notes: [{ id: 'note', content: 'offline edit' }] }]);
  second.harness.unmount();
  const third = mount(); third.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saves.length, 1);
});

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


test('first annotation save waits for registration and retries after registration failure', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let registrationCalls = 0;
  let rpcCalls = 0;
  let failure = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table) {
      assert.equal(table, 'documents');
      return { upsert: async (row, options) => {
        registrationCalls++;
        assert.equal(row.user_id, 'owner');
        assert.equal(options.ignoreDuplicates, true);
        await gate;
        return { error: failure ? { message: 'offline' } : null };
      } };
    },
    rpc: async () => { rpcCalls++; return { error: null }; },
  };
  const api = loadSource('src/lib/supabase/annotations.ts', { './client': { createClient: () => client } });
  const pending = api.saveTextNotes('new-doc', '1', []);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(registrationCalls, 1);
  assert.equal(rpcCalls, 0);
  release(); await pending;
  assert.equal(rpcCalls, 1);
  failure = true;
  await assert.rejects(api.saveTextNotes('new-doc', '1', []), /register document: offline/);
  assert.equal(rpcCalls, 1);
  failure = false;
  await api.saveTextNotes('new-doc', '1', []);
  assert.equal(rpcCalls, 2);
  assert.equal(registrationCalls, 3);
});

test('deleting a document drains active writes, cancels queued collections, and allows explicit reopen', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let exists = true;
  let saves = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table) {
      return {
        upsert: async () => { exists = true; return { error: null }; },
        select: () => ({ match: async () => ({ data: [], count: 0, error: null }) }),
        delete: () => ({ match: async () => { if (table === 'documents') exists = false; return { error: null }; } }),
      };
    },
    rpc: async () => { saves++; if (saves === 1) await gate; return { error: exists ? null : { message: 'missing parent' } }; },
  };
  const api = loadSource('src/lib/supabase/db.ts', {
    './client': { createClient: () => client },
    '@/lib/documentLocalData': { deleteLocalDocument: async () => {} },
  });
  const first = api.saveTextNotes('delete-race', '1', []);
  await new Promise(setImmediate);
  const pending = [
    api.saveTextNotes('delete-race', '1', []),
    api.saveBookmarks('delete-race', []),
    api.saveKeyTerms('delete-race', []),
    api.saveBlankPages('delete-race', []),
    api.saveFlashcards('delete-race', 1, []),
  ];
  const settled = Promise.allSettled([first, ...pending]);
  const deletion = api.deleteAllDataForDocument('delete-race');
  await new Promise(setImmediate);
  release();
  await Promise.all([settled, deletion]);
  assert.equal(exists, false, 'queued saves must not resurrect a deleted parent');
  assert.equal(saves, 1, 'only the already active save may finish');
  await assert.rejects(api.saveTextNotes('delete-race', '1', []), /deleted|deleting/i);
  await api.upsertDocument({ id: 'delete-race', name: 'Reopened PDF', type: 'pdf' });
  await api.saveTextNotes('delete-race', '1', []);
  assert.equal(exists, true);
  assert.equal(saves, 2);
});

test('failed deletion remains blocked until successful explicit registration and does not block another document', async () => {
  const queue = loadSource('src/lib/persistence/documentQueue.ts');
  await assert.rejects(queue.enqueueDocumentDeletion('removed', async () => { throw Error('offline'); }), /offline/);
  await assert.rejects(queue.enqueueDocumentWrite('removed', async () => {}), /deleted/);
  assert.equal(await queue.enqueueDocumentWrite('other', async () => 'saved'), 'saved');
  await assert.rejects(queue.enqueueDocumentRegistration('removed', async () => { throw Error('offline'); }), /offline/);
  await assert.rejects(queue.enqueueDocumentWrite('removed', async () => {}), /deleted/);
  await queue.enqueueDocumentRegistration('removed', async () => {});
  assert.equal(await queue.enqueueDocumentWrite('removed', async () => 'saved'), 'saved');
});

test('registration requested before deletion cannot unblock writes during that deletion', async () => {
  const queue = loadSource('src/lib/persistence/documentQueue.ts');
  let finishRegistration;
  let finishDeletion;
  const registrationGate = new Promise(resolve => { finishRegistration = resolve; });
  const deletionGate = new Promise(resolve => { finishDeletion = resolve; });
  const registration = queue.enqueueDocumentRegistration('doc', () => registrationGate);
  const deletion = queue.enqueueDocumentDeletion('doc', () => deletionGate);
  finishRegistration();
  await registration;
  const lateWrite = queue.enqueueDocumentWrite('doc', async () => 'resurrected');
  const result = Promise.allSettled([lateWrite]);
  finishDeletion();
  await deletion;
  assert.equal((await result)[0].status, 'rejected');
});
