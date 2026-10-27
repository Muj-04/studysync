const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

test('stroke order converges when confirmations arrive out of order', () => {
  const { mergeRoomStroke } = loadSource('src/lib/roomStrokes.ts');
  let first = mergeRoomStroke([], { id: 'local', tool: 'eraser' });
  first = mergeRoomStroke(first, { id: 'remote', seq: 10, tool: 'pen' });
  first = mergeRoomStroke(first, { id: 'local', seq: 11, tool: 'eraser' });
  let second = mergeRoomStroke([], { id: 'local', seq: 11, tool: 'eraser' });
  second = mergeRoomStroke(second, { id: 'remote', seq: 10, tool: 'pen' });
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(s => s.id), ['remote','local']);
  assert.equal(mergeRoomStroke(first, { id: 'local' }), first);
});

test('leaving requires membership, closes only the last member, and is service-only', async () => {
  const db = new PGlite();
  const room = '11111111-1111-4111-8111-111111111111';
  const member = '22222222-2222-4222-8222-222222222222';
  const outsider = '33333333-3333-4333-8333-333333333333';
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE study_rooms(id uuid PRIMARY KEY,status text);
    CREATE TABLE room_members(room_id uuid,user_id uuid);
    INSERT INTO study_rooms VALUES('${room}','active');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261004110000_atomic_room_leave.sql','utf8'));
  const leave = async id => (await db.query('SELECT leave_room_atomic($1,$2) result',[room,id])).rows[0].result;
  try {
    assert.equal(await leave(outsider), false);
    assert.equal((await db.query('SELECT status FROM study_rooms')).rows[0].status,'active');
    await db.query('INSERT INTO room_members VALUES($1,$2)',[room,member]);
    assert.equal(await leave(outsider), false);
    assert.equal(await leave(member), true);
    assert.equal(await leave(member), false);
    assert.equal((await db.query('SELECT status FROM study_rooms')).rows[0].status,'closed');
    await db.exec('SET ROLE authenticated');
    await assert.rejects(leave(member), /permission denied/);
  } finally { await db.close(); }
});

test('microphone permission resolving after navigation immediately stops its tracks', async () => {
  const harness = createHookHarness();
  let resolveStream;
  let stopped = 0;
  const original = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global,'navigator',{ configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveStream = resolve; }) } } });
  try {
    const { useRecordingLifetime } = loadSource('src/hooks/useRecordingLifetime.ts', { react: harness.react });
    const ref = { current: null };
    const acquire = harness.render(() => useRecordingLifetime(ref));
    const request = acquire();
    assert.equal(await acquire(), null);
    harness.unmount();
    resolveStream({ getTracks: () => [{ stop: () => stopped++ }] });
    assert.equal(await request, null);
    assert.equal(stopped, 1);
  } finally { if (original) Object.defineProperty(global,'navigator',original); else delete global.navigator; }
});

test('unmount stops an active recorder and detaches callbacks', () => {
  const harness = createHookHarness();
  let stopped = 0;
  const recorder = { state: 'recording', stop: () => stopped++, onstop: () => {}, ondataavailable: () => {} };
  const ref = { current: { mediaRecorder: recorder, stream: { getTracks: () => [{ stop: () => stopped++ }] }, intervalId: setInterval(() => {}, 1000) } };
  const { useRecordingLifetime } = loadSource('src/hooks/useRecordingLifetime.ts', { react: harness.react });
  harness.render(() => useRecordingLifetime(ref));
  harness.unmount();
  assert.equal(stopped, 2);
  assert.equal(recorder.onstop, null);
  assert.equal(ref.current, null);
});
