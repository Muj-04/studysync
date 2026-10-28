const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');

const { documentDomainFixture } = require('./document-domain-fixture.cjs');

test('failed collection publication rejects dependent writes and retains retry payload', async () => {
  const h = documentDomainFixture();
  await h.prepare('retry', 'drawings');
  h.setFailure('offline');
  await assert.rejects(h.api.saveDrawing('retry', '1', 'image'), /offline/);
  assert.match([...h.storage.values()].join(''), /image/);
  h.setFailure(null);
  await h.collections.retryPendingDocumentWrites('alice');
  assert.equal(h.calls.filter(c => c.kind === 'write').length, 2);
});

test('document domain snapshots and queued writes remain scoped to the current owner', async () => {
  const h = documentDomainFixture();
  await h.prepare('shared', 'drawings');
  await h.api.saveDrawing('shared', '1', 'image', 'alice');
  h.setOwner('bob');
  await assert.rejects(h.api.saveDrawing('shared', '1', 'private', 'alice'), /account/);
  assert.equal(h.calls.length, 1);
});

test('deleted original cannot be reopened through the facade; recovery requires a new identity', async () => {
  const h = documentDomainFixture();
  await h.prepare('deleted', 'drawings');
  await h.api.deleteDocument('deleted');
  await assert.rejects(h.api.saveDrawing('deleted', '1', 'image'), /deleted|deleting/i);
  await assert.rejects(h.api.saveSessionState('deleted', 1), /deleted|deleting/i);
  await assert.rejects(h.api.saveVoiceNote({ id: 'voice', documentId: 'deleted' }), /deleted|deleting/i);
  await assert.rejects(h.api.upsertDocument({ id: 'deleted', name: 'Reopened', type: 'pdf' }), /deleted/i);
  await h.api.upsertDocument({ id: 'recovery-copy', name: 'Recovered', type: 'pdf' });
  await h.prepare('recovery-copy', 'drawings');
  await h.api.saveDrawing('recovery-copy', '1', 'image');
  assert.equal(h.calls.at(-1).args.p_document_id, 'recovery-copy');
});

test('facade preserves domain function identity and keeps internal registration helpers private', () => {
  const cache = new Map();
  const mocks = { './client': { createClient: () => ({}) } };
  const api = loadSource('src/lib/supabase/db.ts', mocks, cache);
  for (const domain of ['documents', 'documentAnnotations', 'voiceNotes', 'community', 'rooms', 'roomAnnotations', 'profiles', 'flashcards', 'messages', 'annotations']) {
    const service = loadSource(`src/lib/supabase/${domain}.ts`, mocks, cache);
    for (const [name, value] of Object.entries(service)) {
      if (name === 'mergeMessages') continue;
      assert.equal(api[name], value, `${domain}.${name} must be a direct re-export`);
    }
  }
  assert.equal(api.ensureDoc, undefined);
  assert.equal(api.markDocumentRegistered, undefined);
});
