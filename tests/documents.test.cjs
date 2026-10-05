const { test } = require('node:test');
const assert = require('node:assert/strict');
const { indexedDB } = require('fake-indexeddb');
const { loadSource } = require('./load-source.cjs');
global.indexedDB = indexedDB;
global.crypto ??= require('node:crypto').webcrypto;

test('PDF metadata survives reopening and stays scoped to its owner', async () => {
  let owner = 'owner-a';
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: owner } } } }) }, from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [] }), then: (resolve) => resolve({ data: [] }) }) }) }) };
  const store = loadSource('src/lib/pdfStore.ts', { '@/lib/supabase/client': { createClient: () => client } });
  await store.savePdfBlob('doc', new Blob(['pdf content']), { filename: 'lecture.pdf', fingerprint: 'hash' });
  assert.equal((await store.getStoredPdf('doc')).filename, 'lecture.pdf');
  assert.equal(await (await store.getPdfBlob('doc')).text(), 'pdf content');
  owner = 'owner-b';
  assert.equal(await store.getPdfBlob('doc'), null);
  owner = 'owner-a';
  assert.equal((await store.getStoredPdf('doc')).fingerprint, 'hash');
  await store.deletePdfBlob('doc');
  assert.equal(await store.getPdfBlob('doc'), null);
});

test('identity follows bytes and account, not filename; legacy IDs are preserved', async () => {
  let owner = 'owner-a';
  const stored = new Map();
  const { identifyPdf } = loadSource('src/lib/documentIdentity.ts', {
    '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) } }) },
    '@/lib/pdfStore': {
      getAllStoredDocIds: async () => [...stored.keys()],
      getStoredPdf: async (id) => stored.get(id),
      savePdfBlob: async (id, blob, metadata) => stored.set(id, { blob, ...metadata }),
    },
  });
  const file = (bytes, name) => Object.assign(new Blob([bytes]), { name });
  const first = await identifyPdf(file('first', 'lecture.pdf'));
  const second = await identifyPdf(file('different', 'lecture.pdf'));
  assert.notEqual(first.id, second.id);
  assert.equal((await identifyPdf(file('first', 'renamed.pdf'))).id, first.id);
  owner = 'owner-b';
  assert.notEqual((await identifyPdf(file('first', 'lecture.pdf'))).id, first.id);
  stored.set('legacy-id', { blob: file('legacy', 'old.pdf') });
  assert.equal((await identifyPdf(file('legacy', 'new-name.pdf'))).id, 'legacy-id');
  await assert.rejects(identifyPdf(file('different', 'old.pdf'), 'legacy-id'), /does not match/);
  assert.equal(await stored.get('legacy-id').blob.text(), 'legacy');
  assert.equal((await identifyPdf(file('legacy', 'renamed.pdf'), 'legacy-id')).id, 'legacy-id');
  await assert.rejects(identifyPdf(file('selected', 'lecture.pdf'), 'unknown-legacy-id'), /Cannot verify/);
  owner = 'owner-a';
  assert.equal((await identifyPdf(file('first', 'lecture.pdf'), first.id)).id, first.id);
  await assert.rejects(identifyPdf(file('different', 'lecture.pdf'), first.id), /Cannot verify/);
  owner = 'owner-b';
  await assert.rejects(identifyPdf(file('first', 'lecture.pdf'), first.id), /Cannot verify/);
});

test('document cleanup preserves other documents and removes only matching keys', async () => {
  const KEYS = Object.fromEntries(['DRAWINGS','TEXT_NOTES','PAGE_IMAGES','BLANK_PAGES','VOICE_NOTES','BOOKMARKS','KEY_TERMS','ZOOM','DOC_MAP','SESSION'].map(key => [key, key]));
  const values = { DRAWINGS: { 'doc:1': 'a', 'other:1': 'b' }, BLANK_PAGES: [{ documentId: 'doc' }, { documentId: 'other' }], DOC_MAP: { 'a.pdf': 'doc', 'b.pdf': 'other' }, SESSION: { docId: 'doc' } };
  const deleted = [];
  const { deleteLocalDocument } = loadSource('src/lib/documentLocalData.ts', {
    './storage': { KEYS, storageGet: key => values[key], storageSet: (key, value) => { values[key] = value; } },
    './pdfStore': { deletePdfBlob: async id => deleted.push(id) },
  });
  await deleteLocalDocument('doc');
  assert.deepEqual(deleted, ['doc']);
  assert.deepEqual(values.DRAWINGS, { 'other:1': 'b' });
  assert.deepEqual(values.BLANK_PAGES, [{ documentId: 'other' }]);
  assert.deepEqual(values.DOC_MAP, { 'b.pdf': 'other' });
  assert.equal(values.SESSION, null);
});
