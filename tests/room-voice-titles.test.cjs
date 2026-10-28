const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
for (const outcome of ['error', 'missing', 'signed-out']) {
  test(`room title update rejects ${outcome} instead of reporting a saved title`, async () => {
    const result = { error: outcome === 'error' ? { message: 'offline' } : null, data: outcome === 'missing' ? null : { id: 'note' } };
    const query = { update() { return this; }, eq() { return this; }, select() { return this; }, maybeSingle: async () => result, then(resolve) { return Promise.resolve(result).then(resolve); } };
    const { updateRoomVoiceNoteTitle } = loadSource('src/lib/supabase/roomAnnotations.ts', { './dbShared': { userId: async () => outcome === 'signed-out' ? null : 'me', sb: () => ({ from: () => query }) } });
    await assert.rejects(updateRoomVoiceNoteTitle('note', 'new'));
  });
}
function setup(t, update) {
  const h = createHookHarness(); const alerts = []; const oldAlert = global.alert;
  global.alert = message => alerts.push(message); t.mock.method(console, 'warn', () => {});
  t.after(() => { h.unmount(); global.alert = oldAlert; });
  const { useRoomVoiceNotes } = loadSource('src/hooks/useRoomVoiceNotes.ts', { react: h.react, './useRecordingLifetime': { useRecordingLifetime: () => async () => null }, '@/lib/recoveryAudio': { retainRecoveryAudio: async () => {} }, '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }) }, '@/lib/supabase/db': { updateRoomVoiceNoteTitle: update } });
  const render = (room = 'room') => h.render(() => useRoomVoiceNotes(room));
  render().seedNotes([{ id: 'note', pageNumber: 1, duration: 2, title: 'old', timestamp: new Date().toISOString(), audioUrl: 'https://audio.invalid/old' }]);
  return { render, alerts, unmount: h.unmount };
}
test('failed title update retains acknowledged title and reports failure', async t => {
  const s = setup(t, async () => { throw Error('offline'); });
  await s.render().updateNoteTitle('note', 'new'); await tick();
  assert.equal(s.render().notes[0].title, 'old'); assert.equal(s.alerts.length, 1);
});
test('rapid title edits serialize their writes and preserve newest saved title', async t => {
  const gate = deferred(); const writes = [];
  const s = setup(t, async (_, title) => { writes.push(title); if (title === 'first') await gate.promise; });
  const first = s.render().updateNoteTitle('note', 'first');
  const second = s.render().updateNoteTitle('note', 'second'); await tick();
  assert.deepEqual(writes, ['first']); assert.equal(s.render().notes[0].title, 'old');
  gate.resolve(); await Promise.all([first, second]);
  assert.deepEqual(writes, ['first', 'second']); assert.equal(s.render().notes[0].title, 'second');
});
test('incoming title refresh updates existing note without replacing playable audio', t => {
  const s = setup(t, async () => {}); const original = s.render().notes[0];
  s.render().addIncomingNote({ id: 'note', pageNumber: 1, duration: 2, title: 'peer edit', timestamp: new Date().toISOString(), audioUrl: 'https://audio.invalid/new' });
  let current = s.render().notes[0]; assert.equal(current.title, 'peer edit'); assert.equal(current.audioUrl, original.audioUrl); assert.equal(current.audioBlob, original.audioBlob);
  s.render().addIncomingNote({ id: 'note', pageNumber: 1, duration: 2, timestamp: new Date().toISOString(), audioUrl: 'https://audio.invalid/new' });
  current = s.render().notes[0]; assert.equal(current.title, undefined);
});
for (const action of ['unmount', 'switch']) for (const outcome of ['success', 'failure']) {
  test(`late title ${outcome} after ${action} cannot change the replacement view`, async t => {
    const gate = deferred(); const s = setup(t, async () => { await gate.promise; if (outcome === 'failure') throw Error('offline'); });
    const updating = s.render().updateNoteTitle('note', 'late'); await tick();
    if (action === 'unmount') s.unmount(); else s.render('next');
    gate.resolve(); await updating; await tick();
    assert.equal(s.alerts.length, 0); s.render('next'); assert.deepEqual(s.render('next').notes, []);
  });
}
test('room realtime refreshes authoritative metadata for a voice-note UPDATE', async () => {
  const handlers = []; const received = []; const h = createHookHarness();
  const channel = { on(kind, filter, callback) { handlers.push({ kind, filter, callback }); return this; }, subscribe() { return this; } };
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'mock' } } }) }, realtime: { setAuth: async () => {} }, channel: () => channel };
  const { useStudyRoom } = loadSource('src/hooks/useStudyRoom.ts', { react: h.react, '@/lib/recoveryAudio': { retainRecoveryAudio: async () => {} }, '@/lib/supabase/client': { createClient: () => client }, '@/lib/realtimeLifecycle': { releaseRealtimeChannel: async () => {}, waitForChannelRelease: async () => {} } });
  h.render(() => useStudyRoom('room', () => {}, undefined, id => received.push(id))); await tick();
  const event = handlers.find(({ filter }) => filter.event === 'UPDATE' && filter.table === 'room_voice_notes');
  assert.ok(event, 'subscribe to persisted voice-note title updates'); assert.equal(event.filter.filter, 'room_id=eq.room');
  event.callback({ new: { id: 'note' } }); assert.deepEqual(received, ['note']);
  h.unmount(); event.callback({ new: { id: 'stale' } }); assert.deepEqual(received, ['note']);
});
test('a failed rename does not block the next queued rename or clearing the title', async t => {
  const writes = [];
  const s = setup(t, async (_, title) => { writes.push(title); if (title === 'bad') throw Error('offline'); });
  const failed = s.render().updateNoteTitle('note', 'bad');
  const clearing = s.render().updateNoteTitle('note', '');
  await Promise.all([failed, clearing]);
  assert.deepEqual(writes, ['bad', undefined]); assert.equal(s.render().notes[0].title, undefined); assert.equal(s.alerts.length, 1);
});
function incomingHandlers() {
  // Run actual component callbacks; this isolates ordering from unrelated PDF/UI hooks.
  const fs = require('node:fs'); const ts = require('typescript');
  const source = fs.readFileSync('src/app/room/[roomId]/RoomClient.tsx', 'utf8');
  const start = source.indexOf('  const handleIncomingVoiceNoteAdded =');
  const end = source.indexOf('  const handleIncomingBlankPage =', start);
  assert.ok(start >= 0 && end > start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const requests = []; const current = new Map(); const voiceNoteRequestsRef = { current: new Map() };
  const callbacks = new Function('useCallback', 'roomId', 'fetchSingleRoomVoiceNote', 'addIncomingNoteRef', 'removeIncomingNoteRef', 'voiceNoteRequestsRef', `${code}\nreturn { add: handleIncomingVoiceNoteAdded, remove: handleIncomingVoiceNoteDelete };`)(
    fn => fn, 'room', () => { const gate = deferred(); requests.push(gate); return gate.promise; },
    { current: note => current.set(note.id, note) }, { current: id => current.delete(id) }, voiceNoteRequestsRef);
  return { ...callbacks, requests, current, voiceNoteRequestsRef };
}
test('late metadata fetch cannot undo a newer voice-note title', async () => {
  const s = incomingHandlers(); const old = s.add('note'); const newer = s.add('note');
  s.requests[1].resolve({ id: 'note', title: 'new', audioUrl: 'url' }); await newer;
  s.requests[0].resolve({ id: 'note', title: 'old', audioUrl: 'url' }); await old;
  assert.equal(s.current.get('note').title, 'new');
});
test('late metadata fetch cannot resurrect a deleted voice note', async () => {
  const s = incomingHandlers(); const pending = s.add('note'); s.remove('note');
  s.requests[0].resolve({ id: 'note', title: 'deleted', audioUrl: 'url' }); await pending;
  assert.equal(s.current.size, 0);
});
for (const action of ['unmount', 'switch']) {
  test(`queued title mutation does not start after ${action}`, async t => {
    const gate = deferred(); const writes = [];
    const s = setup(t, async (_, title) => { writes.push(title); await gate.promise; });
    const first = s.render().updateNoteTitle('note', 'first'); await tick();
    const queued = s.render().updateNoteTitle('note', 'queued');
    if (action === 'unmount') s.unmount(); else s.render('next');
    gate.resolve(); await Promise.all([first, queued]);
    assert.deepEqual(writes, ['first']);
  });
}
test('failed background metadata fetch is contained and the next update can retry', async () => {
  const s = incomingHandlers(); const pending = s.add('note');
  s.requests[0].resolve(Promise.reject(Error('network unavailable')));
  await assert.doesNotReject(pending);
  assert.equal(s.voiceNoteRequestsRef.current.size, 0); assert.equal(s.current.size, 0);
  const retry = s.add('note'); s.requests[1].resolve({ id: 'note', title: 'recovered', audioUrl: 'url' }); await retry;
  assert.equal(s.current.get('note').title, 'recovered');
});
