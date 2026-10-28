const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const { fixture } = require('./recording-fixture.cjs');
for (const stage of ['upload', 'sign']) {
  test(`room audio ${stage} failure cannot persist unplayable metadata`, async () => {
    const f=fixture(); f.state.fail=stage;
    await assert.rejects(f.save());
    assert.equal(f.rows.size, 0);
  });
}
function setup(t, save, remove = async () => {}) {
  const harness = createHookHarness(); let recorder; const alerts = []; let added = 0; let deleted = 0;
  const oldRecorder = global.MediaRecorder, oldAlert = global.alert, oldWindow=global.window;
  const listeners=new Map();
  global.window={addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
  global.alert = message => alerts.push(message);
  global.MediaRecorder = class { static isTypeSupported() { return true; } constructor() { Object.assign(this, { state: 'inactive' }); Object.assign(global.MediaRecorder, { latest: this }); } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; this.onstop?.(); } };
  t.mock.method(console, 'warn', () => {});
  t.after(() => { harness.unmount(); global.MediaRecorder = oldRecorder; global.alert = oldAlert; global.window=oldWindow; });
  const { useRoomVoiceNotes } = loadSource('src/hooks/useRoomVoiceNotes.ts', { react: harness.react, './useRecordingLifetime': { useRecordingLifetime: () => async () => ({ getTracks: () => [] }) }, '@/lib/recoveryAudio': { retainRecoveryAudio: async () => {} }, '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) }, '@/lib/supabase/db': { saveRoomVoiceNote: save, deleteRoomVoiceNote: remove } });
  const render = (room = 'room') => harness.render(() => useRoomVoiceNotes(room, () => added++, () => deleted++));
  return { online:()=>listeners.get('online')?.(), render, unmount: harness.unmount, alerts, get added() { return added; }, get deleted() { return deleted; }, async record() { const hook = render(); await tick(); await hook.startRecording(1); recorder = global.MediaRecorder.latest; recorder.ondataavailable({ data: new Blob(['audio']) }); hook.stopRecording(); await tick(); const n = render().notes[0]; t.after(() => URL.revokeObjectURL(n.audioUrl)); return n; } };
}
test('room recording save rejection retains audio and reports the failed save', async t => {
  const s = setup(t, async () => { throw Error('offline'); });
  await s.record(); await tick();
  assert.equal(s.render().notes.length, 1); assert.equal(s.added, 0); assert.equal(s.alerts.length, 1);
});
test('room deletion waits for a pending save before deleting the persisted note', async t => {
  const gate = deferred(); let persisted = false; let deletes = 0;
  const s = setup(t, async () => { await gate.promise; persisted = true; return 'url'; }, async () => { deletes++; persisted = false; });
  const n = await s.record(); const deletion = s.render().deleteNote(n.id); await tick();
  assert.equal(deletes, 0); assert.equal(s.render().notes.length, 1);
  gate.resolve(); await deletion; await tick();
  assert.equal(persisted, false); assert.equal(s.render().notes.length, 0); assert.equal(s.deleted, 1);
});
test('room deletion rejection retains the visible audio and reports failure', async t => {
  const s = setup(t, async () => 'url', async () => { throw Error('offline'); });
  const n = await s.record(); await s.render().deleteNote(n.id); await tick();
  assert.equal(s.render().notes.length, 1); assert.equal(s.deleted, 0); assert.equal(s.alerts.length, 1);
});
for (const stage of ['storage', 'database']) {
  test(`room deletion propagates ${stage} errors instead of reporting success`, async () => {
    const f=fixture(); await f.save();
    f.state.fail=stage === 'storage' ? 'remove' : 'database-delete';
    await assert.rejects(f.remove());
    assert.equal(f.rows.size, stage === 'storage' ? 0 : 1);
    assert.equal(f.objects.size, 1);
  });
}
test('successful room audio save publishes playable metadata and database failure rejects', async () => {
  const f=fixture();
  assert.match(await f.save(), /voice-notes/);
  assert.equal(f.rows.get('note').room_id, 'scope');
  f.note.id='failed'; f.state.fail='database';
  await assert.rejects(f.save(), /database failed/);
});
test('room recording null URL is reported as a save failure', async t => {
  const s = setup(t, async () => null);
  await s.record(); await tick();
  assert.equal(s.render().notes.length, 1); assert.equal(s.added, 0); assert.equal(s.alerts.length, 1);
});
for (const action of ['unmount', 'switch']) for (const outcome of ['success', 'failure']) {
  test(`room save ${outcome} completing after ${action} cannot notify another view`, async t => {
    const gate = deferred();
    const s = setup(t, async () => { await gate.promise; if (outcome === 'failure') throw Error('offline'); return 'url'; });
    await s.record(); if (action === 'unmount') s.unmount(); else s.render('other-room'); gate.resolve(); await tick();
    assert.equal(s.added, 0); assert.equal(s.alerts.length, 0);
  });
}

test('failed room upload retries retained audio on reconnect and stops after success', async t=>{
  let attempts=0;const owners=[];
  const s=setup(t,async(room,note,owner)=>{owners.push(owner);if(++attempts===1)throw Error('offline');return 'url';});
  await s.record();s.online();await tick();assert.equal(attempts,2);assert.equal(s.added,1);assert.deepEqual(owners,['user','user']);
  s.online();await tick();assert.equal(attempts,2);
  s.render().beginReconcileNotes()([]);
  assert.equal(s.render().notes.length,0,'a confirmed retry releases the unsaved guard for later authoritative removal');
});
test('room retry is cancelled after scope change',async t=>{
  let attempts=0;const s=setup(t,async()=>{attempts++;throw Error('offline');});await s.record();
  s.render('other');s.online();await tick();assert.equal(attempts,1);
});
test('reconnect preserves failed local audio until remote recovery confirms it', async t => {
  const s = setup(t, async () => { throw Error('offline'); });
  const n = await s.record();
  s.render().beginReconcileNotes()([]);
  assert.equal(s.render().notes.length, 1);
  s.render().beginReconcileNotes()([{ id: n.id, pageNumber: 1, duration: 1, audioUrl: 'https://audio.invalid/recovered', timestamp: n.timestamp.toISOString() }]);
  assert.equal(s.render().notes.length, 1);
  // Once confirmed remotely, a subsequent authoritative removal is honored.
  s.render().beginReconcileNotes()([]);
  assert.equal(s.render().notes.length, 0);
});
