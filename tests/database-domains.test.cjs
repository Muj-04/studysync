const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');

function harness() {
  let owner = 'alice';
  let fail = false;
  const registrations = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } } }) },
    from(table) {
      return {
        upsert: async (row) => {
          if (table === 'documents') registrations.push(row.user_id);
          return { error: table === 'documents' && fail ? { message: 'offline' } : null };
        },
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };
  return { registrations, setOwner: (value) => { owner = value; }, setFail: (value) => { fail = value; },
    api: loadSource('src/lib/supabase/db.ts', { './client': { createClient: () => client } }) };
}

test('failed document registration rejects dependent writes and is retried', async () => {
  const h = harness();
  h.setFail(true);
  await assert.rejects(h.api.saveDrawing('retry', '1', 'image'), /offline/);
  h.setFail(false);
  await h.api.savePageImages('retry', 1, []);
  assert.deepEqual(h.registrations, ['alice', 'alice']);
});

test('registration cache is shared between domains and scoped to the current owner', async () => {
  const h = harness();
  await h.api.saveDrawing('shared', '1', 'image');
  await h.api.savePageImages('shared', 1, []);
  assert.deepEqual(h.registrations, ['alice']);
  h.setOwner('bob');
  await h.api.savePageImages('shared', 1, []);
  assert.deepEqual(h.registrations, ['alice', 'bob']);
});

test('all document writers respect deletion and explicit reopen through the facade', async () => {
  const h = harness();
  await h.api.deleteDocument('deleted');
  await assert.rejects(h.api.saveDrawing('deleted', '1', 'image'), /deleted|deleting/i);
  await assert.rejects(h.api.savePageImages('deleted', 1, []), /deleted|deleting/i);
  await assert.rejects(h.api.saveSessionState('deleted', 1), /deleted|deleting/i);
  await assert.rejects(h.api.saveVoiceNote({ id: 'voice', documentId: 'deleted' }), /deleted|deleting/i);
  await h.api.upsertDocument({ id: 'deleted', name: 'Reopened', type: 'pdf' });
  await h.api.saveDrawing('deleted', '1', 'image');
  assert.deepEqual(h.registrations, ['alice']);
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
