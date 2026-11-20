const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
function setup(t, connectGate) {
  const harness = createHookHarness(); const rooms = []; const tokens = [];
  t.mock.method(global, 'fetch', async () => { const gate = deferred(); tokens.push(gate); return gate.promise; });
  const previousWindow = global.window;
  global.window = { addEventListener() {}, removeEventListener() {} };
  class Room {
    constructor() { this.events = {}; this.microphones = 0; this.disconnects = 0; this.localParticipant = { setMicrophoneEnabled: async () => { this.microphones++; } }; rooms.push(this); }
    on(event, callback) { this.events[event] = callback; }
    async connect() { if (rooms.indexOf(this) === 0) await connectGate?.promise; }
    async disconnect() { this.disconnects++; }
  }
  const { useVoiceChat } = loadSource('src/hooks/useVoiceChat.ts', {
    react: { ...harness.react, useCallback(fn, deps) {
      const ref = harness.react.useRef(null);
      if (!ref.current || deps.some((d, i) => !Object.is(d, ref.current.deps[i]))) ref.current = { fn, deps };
      return ref.current.fn;
    } }, 'livekit-client': { Room, RoomEvent: { Disconnected: 'disconnected', ActiveSpeakersChanged: 'speakers', TrackSubscribed: 'track', TrackUnsubscribed: 'untrack' }, Track: { Kind: { Audio: 'audio' } } },
    '@/lib/supabase/client': { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'mock' } } }) } }) },
  });
  const render = (room = 'a') => harness.render(() => useVoiceChat(room, 'user', 'name'));
  const token = i => tokens[i].resolve({ ok: true, json: async () => ({ token: 'mock', url: 'wss://mock.invalid' }) });
  t.after(() => { harness.unmount(); if (previousWindow === undefined) delete global.window; else global.window = previousWindow; });
  return { harness, rooms, render, token };
}
for (const action of ['unmount', 'leave', 'disconnectImmediate', 'switch']) {
  test(`pending voice token cannot connect after ${action}`, async t => {
    const s = setup(t); const hook = s.render(); const joining = hook.join(); await tick();
    if (action === 'unmount') s.harness.unmount(); else if (action === 'switch') s.render('b'); else await hook[action]();
    s.token(0); await joining;
    assert.equal(s.rooms.length, 0);
  });
}
test('old connect completion and callbacks cannot enable audio or clear a replacement room', async t => {
  const gate = deferred(); const s = setup(t, gate); let hook = s.render();
  const oldJoin = hook.join(); await tick(); s.token(0); await tick(); const old = s.rooms[0];
  await hook.leave(); hook = s.render(); assert.equal(hook.connecting, false, 'leave cancels pending connection'); const newJoin = hook.join(); await tick(); s.token(1); await newJoin;
  assert.equal(s.render().connected, true);
  old.events.disconnected(); old.events.speakers([{ identity: 'old' }]);
  gate.resolve(); await oldJoin;
  hook = s.render(); assert.equal(hook.connected, true); assert.equal(hook.speakingIds.size, 0); assert.equal(old.microphones, 0);
  await hook.leave(); assert.ok(s.rooms[1].disconnects > 0);
});
