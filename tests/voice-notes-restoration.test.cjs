const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const persisted = [{ id: 'local', documentId: 'doc', pageNumber: 1, audioDataUrl: 'data:audio/webm;base64,YXVkaW8=', duration: 4, timestamp: '2026-01-01T00:00:00Z' }];

function setup(t) {
  const harness = createHookHarness();
  let stored = structuredClone(persisted);
  const writes = [];
  let resolveUser;
  const user = new Promise(resolve => { resolveUser = resolve; });
  let resolveRemote;
  const remote = new Promise(resolve => { resolveRemote = resolve; });
  let rendering = false;
  let created = 0;
  t.mock.method(URL, 'createObjectURL', () => {
    assert.equal(rendering, false, 'blob URLs must be created after render');
    return `blob:restored-${++created}`;
  });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const previousReader = global.FileReader;
  global.FileReader = class {
    readAsDataURL() { this.result = persisted[0].audioDataUrl; queueMicrotask(() => this.onload()); }
  };
  t.after(() => { harness.unmount(); if (previousReader === undefined) delete global.FileReader; else global.FileReader = previousReader; });
  const { useVoiceNotes } = loadSource('src/hooks/useVoiceNotes.ts', {
    react: {
      ...harness.react,
      useSyncExternalStore(subscribe, getSnapshot) {
        harness.react.useEffect(() => subscribe(() => {}), [subscribe]);
        return getSnapshot();
      },
    },
    './useRecordingLifetime': { useRecordingLifetime: () => async () => null },
    '@/lib/storage': { KEYS: { VOICE_NOTES: 'voice' }, storageGet: () => stored, storageSet: (_key, value) => { stored = value; writes.push(value); return true; } },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: () => user } }) },
    '@/lib/supabase/db': { fetchVoiceNotes: () => remote, deleteVoiceNote() {}, updateVoiceNoteTitle() {} },
  });
  const render = () => harness.render(() => {
    rendering = true;
    try { return useVoiceNotes(); } finally { rendering = false; }
  });
  return { render, harness, writes, getStored: () => stored, getCreated: () => created, resolveUser, resolveRemote };
}

test('local audio restores before auth resolves and initial persistence never erases it', async t => {
  const s = setup(t);
  assert.equal(s.render().notes.length, 0, 'initial snapshot matches server output');
  assert.deepEqual(s.writes, [], 'unrestored initial snapshot must never persist []');
  let hook = s.render();
  assert.equal(hook.notes[0].id, 'local');
  assert.equal(hook.notes[0].audioBlob.size, 5);
  assert.equal(hook.notes[0].audioUrl, 'blob:restored-1');
  assert.equal(s.getCreated(), 1);
  await tick();
  assert.equal(s.getStored()[0].id, 'local');
  hook.updateNoteTitle('local', 'Offline title');
  hook = s.render();
  await tick();
  assert.equal(s.getStored()[0].title, 'Offline title');
  s.resolveUser({ data: { user: { id: 'user' } } });
  await tick();
  await hook.deleteNote('local');
  s.render();
  assert.deepEqual(s.getStored(), [], 'explicit deletion can persist an empty list');
});

test('remote restore merges with local audio without replacing it', async t => {
  const s = setup(t);
  s.render(); s.render();
  s.resolveUser({ data: { user: { id: 'user' } } });
  await tick();
  s.resolveRemote([
    { id: 'local', documentId: 'doc', pageNumber: 1, audioUrl: 'https://example.test/local', duration: 4, timestamp: persisted[0].timestamp },
    { id: 'remote', documentId: 'doc', pageNumber: 2, audioUrl: 'https://example.test/remote', duration: 5, timestamp: persisted[0].timestamp },
  ]);
  await tick();
  const hook = s.render();
  assert.deepEqual(hook.notes.map(note => note.id), ['local', 'remote']);
  assert.equal(hook.notes[0].audioUrl, 'blob:restored-1');
  assert.equal(hook.notes[1].audioBlob.size, 0);
  await tick();
  assert.deepEqual(s.getStored().map(note => note.id), ['local']);
});

test('late initial hydration cannot resurrect an acknowledged personal recording deletion', async t => {
  const s=setup(t);s.render();s.render();s.resolveUser({data:{user:{id:'user'}}});await tick();
  await s.render().deleteNote('local');s.render();
  s.resolveRemote([{id:'local',documentId:'doc',pageNumber:1,audioUrl:'https://example.test/local',duration:4,timestamp:persisted[0].timestamp}]);
  await tick();assert.deepEqual(s.render().notes,[]);assert.deepEqual(s.getStored(),[]);
});
