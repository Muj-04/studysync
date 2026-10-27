const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup() {
  let owner = 'alice';
  const writes = [];
  let onWrite = async () => {};
  const cache = new Map();
  const client = {
    auth: { getUser: async () => ({ data: { user: owner ? { id: owner } : null } }) },
    from: () => ({ upsert: async row => { await onWrite(row); writes.push(row); return { error: null }; } }),
  };
  const mocks = { './client': { createClient: () => client } };
  return {
    api: loadSource('src/lib/supabase/studyActivity.ts', mocks, cache),
    queue: loadSource('src/lib/persistence/documentQueue.ts', mocks, cache),
    writes, setOwner: value => { owner = value; }, setOnWrite: value => { onWrite = value; },
  };
}
test('latest reading position wins when another document has a blocked write', async () => {
  const h = setup(), gate = deferred();
  const blocked = h.queue.enqueueDocumentWrite('a', () => gate.promise);
  const older = h.api.saveSessionState('a', 1);
  await h.api.saveSessionState('b', 2);
  gate.resolve();
  await Promise.all([blocked, older]);
  assert.deepEqual(h.writes.map(row => row.doc_id), ['b']);
});
test('an already active session write finishes before the newer session write', async () => {
  const h = setup(), gate = deferred(), started = deferred();
  h.setOnWrite(async row => { if (row.doc_id === 'a') { started.resolve(); await gate.promise; } });
  const older = h.api.saveSessionState('a', 1);
  await started.promise;
  const newer = h.api.saveSessionState('b', 2);
  await new Promise(resolve => setImmediate(resolve));
  gate.resolve();
  await Promise.all([older, newer]);
  assert.equal(h.writes.at(-1).doc_id, 'b');
});
test('a queued reading position cannot move to a different signed-in account', async () => {
  const h = setup(), gate = deferred();
  const blocked = h.queue.enqueueDocumentWrite('a', () => gate.promise);
  const save = h.api.saveSessionState('a', 1);
  await new Promise(resolve => setImmediate(resolve));
  h.setOwner('bob');
  gate.resolve();
  await Promise.all([blocked, save]);
  assert.deepEqual(h.writes, []);
});
test('session writes still reject for deleted documents', async () => {
  const h = setup();
  await h.queue.enqueueDocumentDeletion('a', async () => {});
  await assert.rejects(h.api.saveSessionState('a', 1), /deleted|deleting/);
  assert.deepEqual(h.writes, []);
});
for (const name of ['deleteAllDrawingsForUser', 'deleteAllVoiceNotesForUser']) {
  test(`${name} rejects server errors and missing identity`, async () => {
    let owner = 'alice';
    const api = loadSource('src/lib/supabase/accountData.ts', {
      './dbShared': {
        userId: async () => owner,
        sb: () => ({ from: () => ({ delete: () => ({ eq: async () => ({ error: new Error('offline') }) }) }) }),
      },
    });
    await assert.rejects(api[name](), /offline/);
    owner = null;
    await assert.rejects(api[name](), /sign in/i);
  });
}
