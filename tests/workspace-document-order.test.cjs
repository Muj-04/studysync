const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

function setup() {
  const harness = createHookHarness();
  let resolveOrder;
  const saved = [];
  const reordered = [];
  const { useDocumentOrder } = loadSource('src/app/(app)/workspace/useDocumentOrder.ts', {
    react: harness.react,
    '@/lib/supabase/db': {
      loadDocumentOrder: () => new Promise(resolve => { resolveOrder = resolve; }),
      saveDocumentOrder: ids => { saved.push(ids); },
    },
  });
  const reorder = docs => reordered.push(docs.map(doc => doc.id));
  let documents = ['a', 'b', 'c'].map(id => ({ id }));
  return {
    ...harness, saved, reordered,
    render: () => harness.render(() => useDocumentOrder(documents, reorder)),
    resolve: async order => { resolveOrder(order); await Promise.resolve(); },
    setDocuments: ids => { documents = ids.map(id => ({ id })); },
  };
}

test('saved order arriving after documents triggers reordering without a document update', async () => {
  const state = setup();
  state.render();
  await state.resolve(['b', 'a']);
  state.render();
  assert.deepEqual(state.reordered, [['b', 'a', 'c']]);
  state.unmount();
});

test('reordering with duplicate or deleted IDs keeps every open document exactly once', () => {
  const state = setup();
  state.render()(['b', 'b', 'deleted', 'a']);
  assert.deepEqual(state.reordered, [['b', 'a', 'c']]);
  state.unmount();
});

test('a late server order cannot overwrite a newer user reorder', async () => {
  const state = setup();
  state.render()(['c', 'a', 'b']);
  state.setDocuments(['c', 'a', 'b']);
  state.render();
  await state.resolve(['b', 'a', 'c']);
  state.setDocuments(['c', 'a', 'b']);
  state.render();
  assert.deepEqual(state.reordered, [['c', 'a', 'b']]);
  state.unmount();
});
