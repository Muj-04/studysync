const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const tables = ['documents', 'voice_notes', 'text_notes', 'bookmarks', 'key_terms'];
function setup() {
  let uid = 'owner', failedTable = null;
  const requests = [];
  const rows = Object.fromEntries(tables.map(table => [table, [{ id: `${table}-id`, marker: table }]]));
  const { exportAllUserData } = loadSource('src/lib/supabase/accountData.ts', {
    './dbShared': { userId: async () => uid, sb: () => ({ from(table) {
      return { select() { return this; }, eq(field, value) {
        requests.push({ table, field, value });
        return Promise.resolve(table === failedTable ? { data: null, error: { message: 'synthetic read failure' } } : { data: rows[table], error: null });
      } };
    } }) },
  });
  return { exportAllUserData, requests, rows, fail(table) { failedTable = table; }, signOut() { uid = null; } };
}
for (const table of tables) {
  test(`account export rejects a failed ${table} read instead of returning a partial download`, async () => {
    const api = setup(); api.fail(table);
    await assert.rejects(api.exportAllUserData(), /export/i);
    assert.equal(api.requests.length, 5);
    assert.ok(api.requests.every(request => request.field === 'user_id' && request.value === 'owner'));
  });
}
test('account export requires an authenticated owner before issuing any read', async () => {
  const api = setup(); api.signOut();
  await assert.rejects(api.exportAllUserData(), /sign in/i);
  assert.deepEqual(api.requests, []);
});
test('successful account export keeps the existing payload and all five collection results', async () => {
  const api = setup();
  const result = await api.exportAllUserData();
  assert.ok(Number.isFinite(Date.parse(result.exportedAt)));
  assert.deepEqual(result, {
    exportedAt: result.exportedAt, documents: api.rows.documents, voiceNotes: api.rows.voice_notes,
    textNotes: api.rows.text_notes, bookmarks: api.rows.bookmarks, keyTerms: api.rows.key_terms,
  });
});
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
test('Settings creates no download for an actual export read failure and a successful retry downloads normally', async t => {
  const api = setup(); api.fail('text_notes');
  const harness = createHookHarness();
  const blobs = []; let downloads = 0;
  t.mock.method(URL, 'createObjectURL', blob => { blobs.push(blob); return 'blob:synthetic'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const oldDocument = global.document;
  global.document = { createElement: () => ({ click() { downloads++; } }) };
  t.after(() => { harness.unmount(); if (oldDocument === undefined) delete global.document; else global.document = oldDocument; });
  const jsx = (type, props) => ({ type, props });
  const { DataSection } = loadSource('src/features/settings/DataSection.tsx', {
    react: harness.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/contexts/LanguageContext': { useLanguage: () => ({ t: key => key }) },
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/lib/supabase/db': { exportAllUserData: api.exportAllUserData, getUserStorageStats: async () => ({ documents: 1, voiceNotes: 1, drawings: 1 }), getLimitUsageStats: async () => null },
  });
  const render = () => nodes(harness.render(DataSection));
  const exportButton = tree => tree.find(node => node.props?.onClick && node.props.children?.includes?.('set_data_export_json'));
  await exportButton(render()).props.onClick();
  let tree = render();
  assert.equal(downloads, 0);
  assert.equal(blobs.length, 0);
  assert.ok(tree.some(node => node.props?.type === 'err'));
  assert.equal(exportButton(tree).props.disabled, false);
  api.fail(null);
  await exportButton(tree).props.onClick();
  tree = render();
  assert.equal(downloads, 1);
  assert.equal(blobs.length, 1);
  assert.deepEqual(JSON.parse(await blobs[0].text()).textNotes, api.rows.text_notes);
  assert.equal(tree.some(node => node.props?.type === 'err'), false);
});
