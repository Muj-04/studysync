const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

function storage(values) {
  return { KEYS: { ...loadSource('src/lib/storage.ts').KEYS, TEXT_NOTES: 'notes', BLANK_PAGES: 'pages' }, storageGet: key => values[key] ?? null,
    storageSet: (key, value) => { values[key] = JSON.parse(JSON.stringify(value)); return true; } };
}

function mountNotes(values, save = async () => {}) {
  const harness = createHookHarness();
  const { useTextNotes } = loadSource('src/hooks/useTextNotes.ts', {
    react: harness.react, '@/lib/storage': storage(values), '@/lib/supabase/db': { saveTextNotes: save },
  });
  const render = () => harness.render(() => useTextNotes('owner'));
  render(); render();
  return { harness, render };
}

function mountPages(values, save = async () => {}) {
  const harness = createHookHarness();
  const { useBlankPages } = loadSource('src/hooks/useBlankPages.ts', {
    react: harness.react, '@/lib/storage': storage(values), '@/lib/supabase/db': { saveBlankPages: save },
  });
  const render = () => harness.render(useBlankPages);
  render(); render();
  return { harness, render };
}

test('clean cached text pages adopt newer cloud edits without writing them back', () => {
  const values = { notes: { 'doc:1': [{ id: 'a', content: 'old' }] } };
  const saved = [];
  const mounted = mountNotes(values, async (...args) => saved.push(args));
  mounted.render()[2]({ 'doc:1': [{ id: 'a', content: 'new on other device' }, { id: 'b', content: 'new note' }] });
  assert.deepEqual(mounted.render()[0]['doc:1'], [{ id: 'a', content: 'new on other device' }, { id: 'b', content: 'new note' }]);
  assert.deepEqual(saved, []);
});

test('failed text edits survive stale cloud hydration after remount', async () => {
  const values = { notes: { 'doc:1': [{ id: 'a', content: 'old' }] } };
  const fail = async () => { throw Error('offline'); };
  let mounted = mountNotes(values, fail);
  mounted.render()[1]({ 'doc:1': [{ id: 'a', content: 'unsaved' }] });
  mounted.render();
  await new Promise(setImmediate);
  mounted.harness.unmount();
  mounted = mountNotes(values, fail);
  mounted.render()[2]({ 'doc:1': [{ id: 'a', content: 'old' }] });
  assert.equal(mounted.render()[0]['doc:1'][0].content, 'unsaved');
  await new Promise(setImmediate);
});

test('failed blank-page deletion is not resurrected by cloud hydration after remount', async () => {
  const page = { id: 'blank', documentId: 'doc', canvasData: 'drawing' };
  const values = { pages: [page] };
  const { saveBlankPages } = loadSource('src/lib/supabase/annotations.ts', {
    './client': { createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
      from: () => ({ upsert: async () => ({ error: null }) }),
      rpc: async (name, args) => {
        assert.equal(name, 'replace_study_collection');
        assert.equal(args.p_collection, 'blank_pages');
        assert.deepEqual(args.p_rows, []);
        return { error: { message: 'offline' } };
      },
    }) },
  });
  let mounted = mountPages(values, saveBlankPages);
  mounted.render().removeBlankPage('blank');
  mounted.render();
  await new Promise(setImmediate);
  mounted.harness.unmount();
  mounted = mountPages(values);
  mounted.render().seedBlankPages([page], 'doc');
  assert.deepEqual(mounted.render().getBlankPagesForDocument('doc'), []);
  assert.deepEqual(values.pages, []);
});

test('clean blank pages adopt cloud updates and removals only for the hydrated document', () => {
  const values = { pages: [{ id: 'blank', documentId: 'doc', canvasData: 'old' }, { id: 'other', documentId: 'other' }] };
  const mounted = mountPages(values);
  mounted.render().seedBlankPages([{ id: 'blank', documentId: 'doc', canvasData: 'new' }], 'doc');
  assert.equal(mounted.render().getBlankPagesForDocument('doc')[0].canvasData, 'new');
  mounted.render().seedBlankPages([], 'doc');
  assert.deepEqual(mounted.render().getBlankPagesForDocument('doc'), []);
  assert.equal(mounted.render().getBlankPagesForDocument('other').length, 1);
});

test('an earlier blank-page save cannot acknowledge a later failed removal', async () => {
  const page = { id: 'blank', documentId: 'doc', canvasData: 'old' };
  const values = { pages: [page] };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const mounted = mountPages(values, async (_doc, pages) => {
    if (pages.length) await gate;
    else throw Error('offline');
  });
  mounted.render().updateCanvasData('blank', 'new');
  mounted.render().removeBlankPage('blank');
  mounted.render();
  release();
  await new Promise(setImmediate);
  mounted.harness.unmount();
  const reopened = mountPages(values);
  reopened.render().seedBlankPages([page], 'doc');
  assert.deepEqual(reopened.render().getBlankPagesForDocument('doc'), []);
});

test('deleting a document clears only its pending blank-page hydration marker', async () => {
  const values = { pages: [], pages_pending: ['doc', 'other'] };
  const { deleteLocalDocument } = loadSource('src/lib/documentLocalData.ts', {
    './storage': storage(values), './pdfStore': { deletePdfBlob: async () => {} },
  });
  await deleteLocalDocument('doc');
  assert.deepEqual(values.pages_pending, ['other']);
});

test('a failed blank-page fetch rejects instead of masquerading as an empty collection', async () => {
  const { fetchBlankPages } = loadSource('src/lib/supabase/documentAnnotations.ts', {
    './dbShared': { userId: async () => 'owner', sb: () => ({
      from: () => ({ select: () => ({ match: async () => ({ data: null, error: { message: 'offline' } }) }) }),
    }) },
  });
  await assert.rejects(fetchBlankPages('doc'), /offline/);
});

test('deleting a document removes only its drawing pending keys and clear marker', async () => {
  const values = { studysync_drawings_pending: ['doc:1', 'doc:*', 'other:1'] };
  const { deleteLocalDocument } = loadSource('src/lib/documentLocalData.ts', {
    './storage': storage(values), './pdfStore': { deletePdfBlob: async () => {} },
  });
  await deleteLocalDocument('doc');
  assert.deepEqual(values.studysync_drawings_pending, ['other:1']);
});
