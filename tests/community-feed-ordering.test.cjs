const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
// Execute the component's actual feed effect, isolating unrelated UI/auth work.
// Source extraction verifies callback ordering; it does not cover DOM rendering,
// React scheduling, or real browser/provider behavior.
const source = fs.readFileSync('src/app/(app)/community/page.tsx', 'utf8');
const start = source.indexOf('  // Feed\n');
const end = source.indexOf('  // Handlers\n', start);
assert.ok(start >= 0 && end > start, 'locate the component feed effect');
const runEffect = new Function('useEffect', 'followingIds', 'tab', 'TABS', 'fetchCommunityPosts', 'setPosts', 'setLoading', 'feedVersion', source.slice(start, end));
function setup() {
  const requests = []; const writes = []; let cleanup;
  const fetchPosts = opts => new Promise(resolve => requests.push({ opts, resolve }));
  const render = (tab, ids = [], version = 0) => {
    cleanup?.();
    runEffect(fn => { cleanup = fn(); }, new Set(ids), tab,
      [{ id: 'trending', serverTab: 'trending' }, { id: 'following', serverTab: 'following' }],
      fetchPosts, posts => writes.push(['posts', posts]), loading => writes.push(['loading', loading]), version);
  };
  return { requests, writes, render, unmount: () => cleanup?.() };
}
test('a slower previous tab cannot overwrite the current community feed', async () => {
  const s = setup(); s.render('trending'); s.render('following', ['friend']);
  s.requests[1].resolve(['followed-post']); await Promise.resolve();
  s.requests[0].resolve(['trending-post']); await Promise.resolve();
  assert.deepEqual(s.writes, [['posts', ['followed-post']], ['loading', false]]);
});
test('changed follows and refresh invalidate older feed results', async () => {
  const s = setup(); s.render('following', ['old']); s.render('following', ['new']); s.render('following', ['new'], 1);
  s.requests[0].resolve(['old-follow']); s.requests[1].resolve(['before-refresh']); await Promise.resolve();
  assert.deepEqual(s.writes, []);
  s.requests[2].resolve(['latest']); await Promise.resolve();
  assert.deepEqual(s.writes, [['posts', ['latest']], ['loading', false]]);
});
test('unmounted community feed ignores its pending response', async () => {
  const s = setup(); s.render('trending'); s.unmount();
  s.requests[0].resolve(['old']); await Promise.resolve();
  assert.deepEqual(s.writes, []);
});
