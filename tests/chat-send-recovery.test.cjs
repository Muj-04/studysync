const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
function mount(t) {
  const harness = createHookHarness();
  t.after(() => harness.unmount());
  const sends = [];
  let messages = [];
  const client = { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: async () => 'ok' };
  const setMessages = update => { messages = update(messages); };
  const { default: Conversation } = loadSource('src/components/ChatConversationView.tsx', {
    react: harness.react,
    '@/lib/supabase/client': { createClient: () => client },
    '@/hooks/useConversationHistory': { useConversationHistory: () => ({ messages, setMessages, loading: false }) },
    '@/lib/supabase/db': { markMessagesRead: async () => {}, sendDirectMessage: (friend, text) => new Promise((resolve, reject) => { sends.push({ friend, text, resolve, reject }); }) },
  });
  const render = (friendId = 'friend') => {
    const tree = harness.render(() => Conversation({ friendId, myUserId: 'me' }));
    return {
      input: find(tree, node => node.type === 'textarea'),
      send: find(tree, node => node.props?.['aria-label'] === 'Send'),
      alert: find(tree, node => node.props?.role === 'alert'),
    };
  };
  render(); render();
  const type = (text, friendId) => { render(friendId).input.props.onChange({ target: { value: text } }); return render(friendId); };
  return { render, type, sends, getMessages: () => messages };
}
const savedMessage = { id: 'message', senderId: 'me', recipientId: 'friend', content: 'first draft', read: false, createdAt: '2026-10-27T00:00:00Z' };

test('a rejected send retains the draft, exposes a retryable error and releases the composer', async t => {
  const app = mount(t);
  let view = app.type('first draft');
  const sending = view.send.props.onClick();
  app.sends[0].reject(new Error('synthetic transport failure'));
  await assert.doesNotReject(sending);
  view = app.render();
  assert.equal(view.input.props.value, 'first draft');
  assert.equal(view.send.props.disabled, false);
  assert.ok(view.alert);
  const retry = view.send.props.onClick();
  app.sends[1].resolve(savedMessage);
  await retry;
  view = app.render();
  assert.equal(view.input.props.value, '');
  assert.equal(view.alert, undefined);
  assert.deepEqual(app.getMessages(), [savedMessage]);
});

for (const outcome of ['failure', 'success']) {
  test(`a ${outcome} response cannot overwrite a newer draft typed while sending`, async t => {
    const app = mount(t);
    const sending = app.type('first draft').send.props.onClick();
    app.type('next draft');
    app.sends[0].resolve(outcome === 'success' ? savedMessage : null);
    await sending;
    const view = app.render();
    assert.equal(view.input.props.value, 'next draft');
    assert.equal(view.send.props.disabled, false);
    assert.equal(!!view.alert, outcome === 'failure');
  });
}

test('a send rejected after changing conversations cannot damage the new draft or show a stale error', async t => {
  const app = mount(t);
  const sending = app.type('first draft').send.props.onClick();
  app.render('other'); app.render('other');
  app.type('private other draft', 'other');
  app.sends[0].reject(new Error('old request failed'));
  await assert.doesNotReject(sending);
  const view = app.render('other');
  assert.equal(view.input.props.value, 'private other draft');
  assert.equal(view.send.props.disabled, false);
  assert.equal(view.alert, undefined);
  assert.deepEqual(app.getMessages(), []);
});
