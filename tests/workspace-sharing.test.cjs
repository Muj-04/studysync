const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}

for (const failure of ['null', 'rejection']) {
  test(`sharing ${failure} keeps the draft open and allows retry`, async t => {
    const harness = createHookHarness();
    t.after(() => harness.unmount());
    const jsx = (type, props) => ({ type, props });
    const timers = [];
    const previousTimeout = global.setTimeout;
    global.setTimeout = fn => { timers.push(fn); return timers.length; };
    t.after(() => { global.setTimeout = previousTimeout; });
    const { default: Share } = loadSource('src/app/(app)/workspace/ShareToCommunityModal.tsx', {
      react: harness.react,
      'react/jsx-runtime': { jsx, jsxs: jsx },
      '@/contexts/LanguageContext': { useLanguage: () => ({ t: key => key }) },
      '@/lib/supabase/db': { createCommunityPost: async () => {
        if (failure === 'rejection') throw new Error('offline');
        return null;
      } },
    });
    const render = () => harness.render(() => Share({ docId: 'doc', docName: 'Notes', pageTextNotes: {}, onClose() {} }));
    let tree = render();
    find(tree, node => node.props?.placeholder === 'ws_share_title_placeholder').props.onChange({ target: { value: 'Draft' } });
    tree = render();
    const submit = find(tree, node => node.type === 'button' && node.props.children === 'ws_share_btn');
    await submit.props.onClick();
    tree = render();
    assert.ok(find(tree, node => node.props?.role === 'alert'), 'show a recoverable error');
    assert.equal(find(tree, node => node.props?.placeholder === 'ws_share_title_placeholder').props.value, 'Draft');
    assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'ws_share_btn').props.disabled, false);
    assert.equal(timers.length, 0, 'failure must not schedule modal dismissal');
  });
}

test('successful sharing includes only this document and cancels delayed dismissal on unmount', async t => {
  const harness = createHookHarness();
  const jsx = (type, props) => ({ type, props });
  let payload;
  let scheduled;
  const cleared = [];
  const previousTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  global.setTimeout = (fn, delay) => { scheduled = { fn, delay }; return 123; };
  global.clearTimeout = id => cleared.push(id);
  t.after(() => {
    harness.unmount();
    global.setTimeout = previousTimeout;
    global.clearTimeout = previousClearTimeout;
  });
  const { default: Share } = loadSource('src/app/(app)/workspace/ShareToCommunityModal.tsx', {
    react: harness.react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/contexts/LanguageContext': { useLanguage: () => ({ t: key => key }) },
    '@/lib/supabase/db': { createCommunityPost: async post => { payload = post; return 'post'; } },
  });
  const props = { docId: 'doc', docName: 'Notes', onClose() {}, pageTextNotes: {
    'doc:2': [{ content: 'My notes', x: 1, y: 2 }],
    'other:1': [{ content: 'Other notes', x: 3, y: 4 }],
  } };
  const render = () => harness.render(() => Share(props));
  let tree = render();
  find(tree, node => node.props?.placeholder === 'ws_share_title_placeholder').props.onChange({ target: { value: '  Draft  ' } });
  tree = render();
  await find(tree, node => node.type === 'button' && node.props.children === 'ws_share_btn').props.onClick();
  render();
  assert.equal(payload.title, 'Draft');
  assert.deepEqual(payload.pages, [{ pageKey: '2', textNotes: [{ content: 'My notes', x: 1, y: 2 }], canvasData: null }]);
  assert.equal(scheduled.delay, 1200);
  harness.unmount();
  assert.deepEqual(cleared, [123]);
});
