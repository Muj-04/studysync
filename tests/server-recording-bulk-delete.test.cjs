const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

test('bulk deletion fences uploaded unpublished local audio before removing playback', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/server-recording-fixture.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261028203014_server_recording_operations.sql', 'utf8'));
  const owner = '11111111-1111-4111-8111-111111111111';
  const generation = '33333333-3333-4333-8333-333333333333';
  const note = '55555555-5555-4555-8555-555555555555';
  const notBegun = '66666666-6666-4666-8666-666666666666';
  await db.exec(`SET request.storage.operation='object.upload';SET request.jwt.claim.sub='${owner}';SET request.jwt.claim.role='authenticated';SET ROLE authenticated`);
  const op = (await db.query("SELECT begin_recording_operation($1,'document','doc',$2,'1',2,'audio/webm',5,'Lecture',now(),$3) op", [note, generation, owner])).rows[0].op;
  await db.query(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes',$1,'{"size":5,"mimetype":"audio/webm"}')`, [op.object_path]);
  // The browser lost confirmation; the worker can still publish these bytes.
  let failDeletion = true;
  const client = {
    rpc: async (name, args) => {
      assert.ok(['delete_recording_identity', 'delete_document_recordings'].includes(name));
      if (failDeletion) return { error: { message: 'offline' } };
      if (name === 'delete_document_recordings') return { data: (await db.query('SELECT delete_document_recordings($1,$2,$3) n', [args.p_document_id, args.p_generation, args.p_expected_owner])).rows[0].n, error: null };
      const data = (await db.query('SELECT delete_recording_identity($1,$2,$3,$4,$5) op', [args.p_note_id, args.p_scope, args.p_scope_id, args.p_generation, args.p_expected_owner])).rows[0].op;
      return { data, error: null };
    },
    from: () => ({ select: () => ({ match: async () => {
      const { rows } = await db.query('SELECT id FROM voice_notes');
      return { data: rows, count: rows.length, error: null };
    } }) }),
  };
  const oldFlag = process.env.NEXT_PUBLIC_SERVER_RECORDING_RECOVERY;
  process.env.NEXT_PUBLIC_SERVER_RECORDING_RECOVERY = 'true';
  t.after(() => { if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_SERVER_RECORDING_RECOVERY; else process.env.NEXT_PUBLIC_SERVER_RECORDING_RECOVERY = oldFlag; });
  const h = createHookHarness();
  const oldAlert = global.alert;
  global.alert = () => {};
  t.after(() => { h.unmount(); global.alert = oldAlert; });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  const mocks = {
    react: { ...h.react, useSyncExternalStore: (subscribe, getSnapshot) => { subscribe(() => {}); return getSnapshot(); } },
    './dbShared': { sb: () => client, userId: async () => owner },
    './documentProtocol': { knownDocumentGeneration: () => generation },
    '@/lib/recoveryAudio': { retainRecoveryAudio: async () => {} },
    '@/lib/storage': { KEYS: { VOICE_NOTES: 'notes' }, storageGet: key => key === 'notes' ? [note, notBegun].map(id => ({ id, documentId: 'doc', pageNumber: 1, audioDataUrl: 'data:audio/webm;base64,YXVkaW8=', duration: 2, timestamp: '2026-10-28T00:00:00Z' })) : null, storageSet: () => true },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) } }) },
  };
  const cache = new Map();
  const personal = loadSource('src/lib/supabase/voiceNotes.ts', mocks, cache);
  const documents = loadSource('src/lib/supabase/documents.ts', mocks, cache);
  mocks['@/lib/supabase/db'] = { fetchVoiceNotes: async () => [], deleteVoiceNote: personal.deleteVoiceNote, deleteAllVoiceNotesForDocument: documents.deleteAllVoiceNotesForDocument };
  const { useVoiceNotes } = loadSource('src/hooks/useVoiceNotes.ts', mocks, cache);
  const render = () => h.render(useVoiceNotes);
  render();
  await new Promise(setImmediate);
  assert.equal(render().notes.length, 2);
  await render().deleteNotesForDocument('doc');
  assert.equal(render().notes.length, 2, 'failed cancellation must retain local playback');
  failDeletion = false;
  await render().deleteNotesForDocument('doc');
  assert.equal(render().notes.length, 0);
  const confirmed = (await db.query('SELECT confirm_recording_upload($1) op', [op.id])).rows[0].op;
  assert.equal(confirmed.state, 'deleting', 'late confirmation must not resurrect bulk-deleted audio');
  assert.equal((await db.query('SELECT count(*)::int n FROM voice_notes')).rows[0].n, 0);
  await assert.rejects(db.query("SELECT begin_recording_operation($1,'document','doc',$2,'1',2,'audio/webm',5,'Late begin',now(),$3)", [notBegun, generation, owner]), /deleted/);
});
