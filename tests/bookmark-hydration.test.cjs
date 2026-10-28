const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const filename = 'src/app/(app)/workspace/page.tsx';
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function callback(name, deps) {
  let selected;
  function visit(node) {
    if (name === 'hydrate' && ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
        && node.arguments[0]?.getText(source).includes('fetchBookmarks(activeDocumentId)')) selected = node.arguments[0];
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name
        && node.initializer && ts.isCallExpression(node.initializer)) selected = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(selected, `workspace ${name} callback exists`);
  const output = ts.transpileModule(`const callback = ${selected.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(deps), `${output}; return callback;`)(...Object.values(deps));
}

function setup() {
  const original = { id: 'removed', documentId: 'doc', virtualIndex: 0, label: 'Page 1' };
  let stored = { doc: [original] }, visible = [original], resolve;
  const saves = [];
  const deps = { retainDocumentSnapshot: () => {},
    activeDocumentId: 'doc', activeDocument: { id: 'doc' }, userId: 'owner', userIdRef: { current: 'owner' },
    bookmarkEditVersions: { current: new Map() }, KEYS: { BOOKMARKS: 'bookmarks' },
    storageGet: () => stored, storageSet: (_, value) => { stored = value; },
    setBookmarks: marks => { visible = marks; },
    fetchBookmarks: () => new Promise(done => { resolve = done; }),
    dbSaveBookmarks: async (doc, marks) => saves.push({ doc, marks }), console: { error() {} },
  };
  deps.persistBookmarks = callback('persistBookmarks', deps);
  return {
    original, saves, stored: () => stored, visible: () => visible,
    begin: () => callback('hydrate', deps)(),
    remove: () => callback('handleRemoveBookmark', { ...deps, bookmarks: visible })('removed'),
    persistOther: () => deps.persistBookmarks('other', [{ id: 'other-mark', documentId: 'other' }]),
    resolve: async rows => { resolve(rows); await new Promise(setImmediate); },
  };
}

test('a bookmark removed during a fetch cannot be restored by its stale response', async () => {
  const state = setup();
  state.begin();
  state.remove();
  assert.deepEqual(state.visible(), []);
  await state.resolve([state.original]);
  assert.deepEqual(state.visible(), []);
  assert.deepEqual(state.stored().doc, []);
  assert.deepEqual(state.saves, [{ doc: 'doc', marks: [] }]);
});

test('an unrelated document edit does not suppress bookmark hydration', async () => {
  const state = setup();
  state.begin();
  state.persistOther();
  await state.resolve([{ ...state.original, label: 'Cloud label' }]);
  assert.equal(state.visible()[0].label, 'Cloud label');
});

test('a fresh fetch after a local edit can hydrate bookmarks normally', async () => {
  const state = setup();
  state.remove();
  state.begin();
  await state.resolve([{ id: 'new-cloud', documentId: 'doc', label: 'New cloud bookmark' }]);
  assert.deepEqual(state.visible(), [{ id: 'new-cloud', documentId: 'doc', label: 'New cloud bookmark' }]);
});
