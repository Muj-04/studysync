const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

for (const outcome of ['success', 'failure']) {
  test(`a send resolving with ${outcome} for the previous friend cannot change the current chat`, async () => {
    const harness = createHookHarness();
    let resolveSend;
    let messages = [];
    const setMessages = update => { messages = typeof update === 'function' ? update(messages) : update; };
    const client = {
      channel: () => ({ on() { return this; }, subscribe() { return this; }, topic: 'test' }),
      removeChannel: async () => 'ok',
    };
    const { default: Conversation } = loadSource('src/components/ChatConversationView.tsx', {
      react: harness.react,
      '@/lib/supabase/client': { createClient: () => client },
      '@/hooks/useConversationHistory': { useConversationHistory: () => ({ messages, setMessages, loading: false }) },
      '@/lib/supabase/db': { markMessagesRead: async () => {}, sendDirectMessage: (friend, text) => {
        assert.equal(friend, 'friend-a'); assert.equal(text, 'draft A');
        return new Promise(resolve => { resolveSend = resolve; });
      } },
    });
    function find(node, type) {
      if (!node || typeof node !== 'object') return undefined;
      if (node.type === type) return node;
      for (const child of [node.props?.children].flat(Infinity)) {
        const match = find(child, type);
        if (match) return match;
      }
    }
    const render = friendId => harness.render(() => Conversation({ friendId, myUserId: 'me' }));
    try {
      let view = render('friend-a');
      find(view, 'textarea').props.onChange({ target: { value: 'draft A' } });
      view = render('friend-a');
      const sending = find(view, 'button').props.onClick();
      view = render('friend-b');
      view = render('friend-b');
      find(view, 'textarea').props.onChange({ target: { value: 'draft B' } });
      view = render('friend-b');
      assert.equal(find(view, 'button').props.disabled, false, 'new chat must not inherit the pending send');
      resolveSend(outcome === 'success' ? { id: 'old-send', senderId: 'me', recipientId: 'friend-a', content: 'draft A', read: false, createdAt: '2026-10-04T12:00:00Z' } : null);
      await sending;
      view = render('friend-b');
      assert.deepEqual(messages, []);
      assert.equal(find(view, 'textarea').props.value, 'draft B');
    } finally { harness.unmount(); resolveSend?.(null); }
  });
}

test('conversation views own independent channels across concurrent mounts and reopening', async () => {
  const { RealtimeClient } = require('@supabase/realtime-js');
  const realtime = new RealtimeClient('ws://localhost:1234/socket', { params: { apikey: 'test' }, timeout: 20 });
  realtime.connect = () => {}; // No websocket: exercise the real channel cache and callbacks locally.
  const created = new Set();
  const client = { channel: (...args) => { const channel = realtime.channel(...args); channel.timeout = 20; created.add(channel); return channel; }, removeChannel: channel => realtime.removeChannel(channel) };
  const lifecycle = loadSource('src/lib/realtimeLifecycle.ts');
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  let updates = 0;
  const mounts = [];
  function mount() {
    const harness = createHookHarness();
    mounts.push(harness);
    const { default: Conversation } = loadSource('src/components/ChatConversationView.tsx', {
      react: harness.react,
      '@/lib/supabase/client': { createClient: () => client },
      '@/lib/realtimeLifecycle': lifecycle,
      '@/hooks/useConversationHistory': { useConversationHistory: () => ({ messages: [], setMessages: () => updates++, loading: false }) },
      '@/lib/supabase/db': { markMessagesRead: async () => {}, sendDirectMessage: async () => null },
    });
    harness.render(() => Conversation({ friendId: 'friend', myUserId: 'me' }));
  }
  try {
    mount();
    await new Promise(resolve => setImmediate(resolve));
    const old = realtime.getChannels()[0];
    mount();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(realtime.getChannels().length, 2);
    const unsubscribe = old.unsubscribe.bind(old);
    old.unsubscribe = async () => { await gate; return unsubscribe(); };
    mounts[0].unmount();
    assert.doesNotThrow(mount);
    await new Promise(resolve => setImmediate(resolve));
    const payload = { new: { id: 'message', sender_id: 'friend', recipient_id: 'me', content: 'hello', read: false, created_at: '2026-10-04T12:00:00Z' } };
    old.bindings.postgres_changes[0].callback(payload);
    assert.equal(updates, 0);
    assert.equal(realtime.getChannels().length, 3);
    finish();
    await new Promise(resolve => setImmediate(resolve));
    const current = realtime.getChannels();
    assert.equal(current.length, 2);
    assert.ok(!current.includes(old));
    current.forEach(channel => channel.bindings.postgres_changes[0].callback(payload));
    assert.equal(updates, 2);
  } finally {
    finish();
    mounts.forEach(harness => harness.unmount());
    await new Promise(resolve => setImmediate(resolve));
    await realtime.removeAllChannels();
    created.forEach(channel => channel.teardown());
    realtime.disconnect();
  }
});

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
