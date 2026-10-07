const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');

test('reopening a realtime topic waits for asynchronous removal across mounts', async () => {
  const { releaseRealtimeChannel, waitForChannelRelease } = loadSource('src/lib/realtimeLifecycle.ts');
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const old = { topic: 'realtime:room:123' };
  let cached = old;
  const client = { removeChannel: async () => { await gate; cached = null; } };
  const removal = releaseRealtimeChannel(client, old);
  let ready = false;
  const reconnect = waitForChannelRelease(client, 'room:123').then(() => { ready = true; assert.equal(cached,null); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ready,false);
  finish();await Promise.all([removal,reconnect]);
  assert.equal(ready,true);
});

test('a stale room join completes its compensating leave before the next mount joins', async () => {
  const { enqueueRoomMembership } = loadSource('src/lib/roomMembershipQueue.ts');
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const events=[];
  const stale=enqueueRoomMembership('room', async()=>{events.push('old join');await gate;events.push('old leave');});
  const current=enqueueRoomMembership('room', async()=>{events.push('new join');});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,['old join']);
  finish();await Promise.all([stale,current]);
  assert.deepEqual(events,['old join','old leave','new join']);
});
