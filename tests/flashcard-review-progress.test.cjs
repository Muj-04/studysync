const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : !tree || typeof tree !== 'object' ? [] : [tree, ...nodes(tree.props?.children)];
const content = tree => Array.isArray(tree) ? tree.map(content).join('') : tree && typeof tree === 'object' ? content(tree.props?.children) : typeof tree === 'string' ? tree : '';
async function mount(t) {
  const oldWindow = global.window;
  global.window = { addEventListener() {}, removeEventListener() {} };
  const parent = createHookHarness(), study = createHookHarness(); let current = parent;
  t.after(() => { parent.unmount(); study.unmount(); if (oldWindow === undefined) delete global.window; else global.window = oldWindow; });
  const react = Object.fromEntries(Object.keys(parent.react).map(key => [key, (...args) => current.react[key](...args)]));
  react.useMemo = fn => fn();
  const writes = []; let failure = false, deckFailure = false, missing = false;
  const { reviewFlashcard } = loadSource('src/lib/supabase/flashcards.ts', {
    './dbShared': { userId: async () => 'owner', sb: () => ({ from: table => ({
      update(patch) { this.patch = patch; return this; }, eq() { return this; },
      select() { return this; }, maybeSingle() { return this; },
      then(resolve) { if (table === 'flashcard_decks' && deckFailure) throw new Error('Synthetic deck timestamp failure'); if (table === 'flashcards') writes.push(this.patch); resolve({ data: missing || failure ? null : { id: 'card' }, error: failure ? { message: 'Synthetic save failure' } : null }); },
    }) }) },
  });
  const card = { id:'card',deckId:'deck',docId:'doc',pageNum:1,question:'Question',answer:'Answer',createdAt:'2026-01-01',nextReviewAt:'2026-01-01',intervalDays:0,reviewCount:0,lastReviewedAt:null };
  const jsx = (type, props) => ({type,props});
  const { default: Page } = loadSource('src/app/(app)/flashcards/page.tsx', {
    react, 'react/jsx-runtime': {jsx,jsxs:jsx},
    'lucide-react': new Proxy({}, {get:()=>()=>null}), '@/hooks/useAuthGuard': {useAuthGuard() {}},
    '@/lib/supabase/db': { reviewFlashcard, loadDeckFlashcards: async () => [card],
      fetchFlashcardDecks: async () => [{id:'deck',name:'Synthetic deck',cardCount:1,dueCount:1,masteredCount:0}],
      fetchLibraryDocuments:async()=>[], getStudyStreak:async()=>0 },
  });
  parent.render(Page); await settle();
  nodes(parent.render(Page)).find(n=>n.type==='button' && n.props.children==='Continue').props.onClick();
  const element=parent.render(Page); assert.equal(element.type.name,'StudyMode');
  current=study;
  const render=()=>nodes(study.render(()=>element.type(element.props)));
  render(); await settle();
  return {writes,render,missing:()=>{missing=true;},restore:()=>{missing=false;},failDeck:()=>{deckFailure=true;},fail:()=>{failure=true;},succeed:()=>{failure=false;}, async good() {
    render().find(n=>n.type==='button' && n.props.children==='Show answer').props.onClick();
    const button=render().find(n=>n.type==='button' && content(n).startsWith('Good'));
    await button.props.onClick(); await settle(); render();
  } };
}
test('repeated review of a card in the same study session uses its acknowledged schedule', async t=>{
  const app=await mount(t);
  await app.good(); await app.good();
  assert.deepEqual(app.writes.map(p=>[p.review_count,p.interval_days]),[[1,1],[2,2]]);
});
test('failed review preserves the card, reports error and remains retryable', async t=>{
  const app=await mount(t); app.fail();
  await assert.doesNotReject(app.good());
  assert.ok(app.render().some(n=>n.props?.role==='alert'));
  const button=app.render().find(n=>n.type==='button' && content(n).startsWith('Good'));
  assert.equal(button.props.disabled,false);
  app.succeed(); await button.props.onClick(); await settle(); app.render();
  assert.deepEqual(app.writes.map(p=>[p.review_count,p.interval_days]),[[1,1],[1,1]], 'failed review must not advance schedule');
});

test('acknowledged card reviews advance even if the secondary deck timestamp update rejects', async t=>{
  const app=await mount(t); app.failDeck();
  await app.good();
  assert.equal(app.render().some(n=>n.props?.role==='alert'),false);
  await app.good();
  assert.deepEqual(app.writes.map(p=>[p.review_count,p.interval_days]),[[1,1],[2,2]]);
});

test('deleted or hidden flashcard cannot acknowledge a review and retry preserves its schedule', async t => {
  const app = await mount(t); app.missing();
  await app.good();
  assert.ok(app.render().some(n => n.props?.role === 'alert'), 'zero affected rows must show a save failure');
  const button = app.render().find(n => n.type === 'button' && content(n).startsWith('Good'));
  assert.equal(button.props.disabled, false);
  app.restore(); await button.props.onClick(); await settle(); app.render();
  assert.deepEqual(app.writes.map(p => [p.review_count, p.interval_days]), [[1,1],[1,1]]);
  assert.equal(app.render().some(n => n.props?.role === 'alert'), false);
});
