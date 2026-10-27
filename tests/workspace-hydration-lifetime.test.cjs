const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { loadSource } = require('./load-source.cjs');

// Run the real workspace hydration effect without mounting its unrelated UI.
function hydrationEffect(overrides = {}) {
  const filename = 'src/app/(app)/workspace/page.tsx';
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
        && node.arguments[0]?.getText(source).includes('const syncDoc =')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(effect, 'workspace document hydration effect exists');
  const writes = [];
  const deps = {
    activeDocumentId: 'doc', activeDocument: { id: 'doc', name: 'Document', type: 'pdf', pageCount: 1 }, userId: 'owner',
    upsertDocument: async () => 'doc', updateDocumentId: (...args) => writes.push(['remap', ...args]),
    fetchDrawings: async () => ({}), fetchBlankPages: async () => [], fetchTextNotes: async () => ({}),
    fetchVoiceNotes: async () => [], fetchAllPageImages: async () => ({}),
    seedDrawings: (...args) => writes.push(['drawings', ...args]), seedBlankPages: (...args) => writes.push(['blank', ...args]),
    seedTextNotes: (...args) => writes.push(['notes', ...args]), seedVoiceNotes: (...args) => writes.push(['voice', ...args]),
    seedPageImages: (...args) => writes.push(['images', ...args]), loadLocalPageImages: (...args) => writes.push(['local-images', ...args]),
    pageTextNotes: {}, dbSaveTextNotes: async (...args) => writes.push(['save-notes', ...args]),
    console: { log() {}, error() {} }, ...overrides,
  };
  const output = ts.transpileModule(`const effect = ${effect.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return { run: new Function(...Object.keys(deps), `${output}; return effect;`)(...Object.values(deps)), writes };
}

test('navigation before registration returns prevents a stale document remap', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { run, writes } = hydrationEffect({ upsertDocument: () => gate });
  const cleanup = run();
  cleanup?.();
  release('canonical-other-id');
  await new Promise(setImmediate);
  assert.deepEqual(writes, []);
});

test('navigation or sign-out during fetch cannot seed old account data or upload local notes', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { run, writes } = hydrationEffect({ fetchDrawings: () => gate, pageTextNotes: { 'doc:1': [{ id: 'old-account-note' }] } });
  const cleanup = run();
  await new Promise(setImmediate);
  cleanup?.();
  release({ 1: 'old-account-drawing' });
  await new Promise(setImmediate);
  assert.deepEqual(writes, []);
});

test('real blank-page read failure leaves the existing workspace cache untouched', async () => {
  const { fetchBlankPages } = loadSource('src/lib/supabase/documentAnnotations.ts', {
    './dbShared': { userId: async () => 'owner', sb: () => ({
      from: () => ({ select: () => ({ match: async () => ({ data: null, error: { message: 'offline' } }) }) }),
    }) },
  });
  let cached = [{ id: 'blank', documentId: 'doc', canvasData: 'retained' }];
  const { run, writes } = hydrationEffect({ fetchBlankPages, seedBlankPages: pages => { cached = pages; } });
  run();
  await new Promise(setImmediate);
  assert.deepEqual(cached, [{ id: 'blank', documentId: 'doc', canvasData: 'retained' }]);
  assert.deepEqual(writes, []);
});
