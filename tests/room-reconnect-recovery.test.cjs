const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { loadSource } = require('./load-source.cjs');
const { createHookHarness } = require('./hook-harness.cjs');
const note = (id, title='old') => ({ id, title, audioUrl: 'https://audio.invalid/'+id, pageNumber:1, duration:2, timestamp:'2026-10-28T00:00:00Z' });
function setup(t, update = async()=>{}) {
  const h=createHookHarness(); t.after(()=>h.unmount());
  const {useRoomVoiceNotes}=loadSource('src/hooks/useRoomVoiceNotes.ts',{react:h.react,'./useRecordingLifetime':{useRecordingLifetime:()=>async()=>null},'@/lib/supabase/db':{updateRoomVoiceNoteTitle:update}});
  const render=(room='room')=>h.render(()=>useRoomVoiceNotes(room)); render();
  return {render, h};
}
test('reconnect loads missed voice and blank snapshots as well as strokes', async()=>{
  const source=fs.readFileSync('src/app/room/[roomId]/RoomClient.tsx','utf8');
  const start=source.indexOf('  const handleReconnect ='); const end=source.indexOf('  useEffect(() => {',start);
  const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  let reconciled=0;
  const run=new Function('useCallback','roomId','fetchAllRoomStrokes','appendStrokeLocal','maxLocalSeqRef','reconcileRoomSnapshots','snapshotLifetime',code+'; return handleReconnect;')(
    fn=>fn,'room',async()=>[],()=>{}, {current:0},async()=>{reconciled++},{current:{active:true,roomId:"room"}});
  await run(); assert.equal(reconciled,1);
});
test('authoritative voice snapshot removes missing rows and updates titles without replacing local audio',t=>{
  const s=setup(t); s.render().seedNotes([note('kept'),note('deleted')]); const audio=s.render().notes[0].audioBlob;
  assert.equal(typeof s.render().beginReconcileNotes,'function');
  const apply=s.render().beginReconcileNotes(); apply([note('kept','new'),note('added')]);
  assert.deepEqual(s.render().notes.map(n=>[n.id,n.title]),[['kept','new'],['added','old']]);
  assert.equal(s.render().notes[0].audioBlob,audio);
});
test('initial snapshot cannot undo a live deletion, insertion or title refresh',t=>{
  const s=setup(t); s.render().seedNotes([note('deleted'),note('changed')]);
  assert.equal(typeof s.render().beginReconcileNotes,'function'); const apply=s.render().beginReconcileNotes();
  s.render().removeIncomingNote('deleted'); s.render().addIncomingNote(note('changed','new')); s.render().addIncomingNote(note('added'));
  apply([note('deleted'),note('changed')]);
  assert.deepEqual(s.render().notes.map(n=>[n.id,n.title]),[['changed','new'],['added','old']]);
});
for(const method of ['fetchRoomVoiceNotes','fetchRoomBlankPages']) test(`${method} rejects failed reads instead of an authoritative empty result`,async()=>{
  const query={select(){return this},eq(){return this},order:async()=>({data:null,error:{message:'offline'}})};
  const db=loadSource('src/lib/supabase/roomAnnotations.ts',{'./dbShared':{sb:()=>({from:()=>query})}});
  await assert.rejects(db[method]('room'),/offline/);
});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('subscribing the first time closes the initial fetch-to-subscription gap',async t=>{
  const h=createHookHarness();t.after(()=>h.unmount());let subscribed;let reads=0;
  const channel={on(){return this},subscribe(fn){subscribed=fn;return this},track:async()=>{}};
  const client={auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},realtime:{setAuth:async()=>{}},channel:()=>channel,from:()=>({select(){return this},eq:async()=>({data:[],error:null})})};
  const {useStudyRoom}=loadSource('src/hooks/useStudyRoom.ts',{react:h.react,'@/lib/supabase/client':{createClient:()=>client},'@/lib/realtimeLifecycle':{releaseRealtimeChannel:async()=>{},waitForChannelRelease:async()=>{}}});
  h.render(()=>useStudyRoom('room',()=>{},()=>{reads++}));await new Promise(setImmediate);await subscribed('SUBSCRIBED');assert.equal(reads,1);
});
test('snapshots cannot overwrite an in-flight or newly acknowledged local rename',async t=>{
  const gate=deferred(); const s=setup(t,()=>gate.promise);s.render().seedNotes([note('one')]);
  const renaming=s.render().updateNoteTitle('one','local');await Promise.resolve();
  const apply=s.render().beginReconcileNotes();gate.resolve();await renaming;apply([note('one','stale')]);
  assert.equal(s.render().notes[0].title,'local');
});
test('older snapshots and snapshots from a previous room cannot replace current data',t=>{
  const s=setup(t);s.render().seedNotes([note('one')]); const older=s.render().beginReconcileNotes();const newer=s.render().beginReconcileNotes();
  newer([note('one','new')]);older([note('one','old')]);assert.equal(s.render().notes[0].title,'new');
  const obsolete=s.render().beginReconcileNotes();s.render('other');obsolete([]);assert.equal(s.render('other').notes.length,0);
});
function roomSnapshots(t) {
  const voice=setup(t); voice.render().seedNotes([note('old'),note('changed')]);
  const {createRoomSnapshotGate}=loadSource('src/lib/roomSnapshot.ts');
  const blankSnapshots={current:createRoomSnapshotGate()};
  const pendingBlankSaves={current:new Set()};
  const snapshotLifetime={current:{active:true,roomId:"room"}};
  let pages=[{id:'old-page'},{id:'changed-page',bgTheme:'white'}];
  const requests={voice:[],blank:[]};
  const source=fs.readFileSync('src/app/room/[roomId]/RoomClient.tsx','utf8');
  const start=source.indexOf('  const reconcileRoomSnapshots =');const end=source.indexOf('  const handleReconnect =',start);
  const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  const run=new Function('useCallback','roomId','snapshotLifetime','beginVoiceSnapshotRef','blankSnapshots','pendingBlankSaves','voiceNoteRequestsRef','fetchRoomVoiceNotes','fetchRoomBlankPages','setRoomBlankPages',code+';return reconcileRoomSnapshots;')(
    fn=>fn,'room',snapshotLifetime,{current:()=>voice.render().beginReconcileNotes()},blankSnapshots,pendingBlankSaves,{current:new Map()},
    ()=>{const gate=deferred();requests.voice.push(gate);return gate.promise},()=>{const gate=deferred();requests.blank.push(gate);return gate.promise},update=>{pages=update(pages)});
  return {voice,run,requests,blankSnapshots,pendingBlankSaves,snapshotLifetime,get pages(){return pages},setPages(value){pages=value}};
}
test('room reconnect authoritatively reconciles missed additions, deletions and updates in both collections',async t=>{
  const s=roomSnapshots(t);const run=s.run();
  s.requests.voice[0].resolve([note('changed','remote'),note('new')]);s.requests.blank[0].resolve([{id:'changed-page',bgTheme:'dark'},{id:'new-page'}]);await run;
  assert.deepEqual(s.voice.render().notes.map(n=>[n.id,n.title]),[['changed','remote'],['new','old']]);
  assert.deepEqual(s.pages,[{id:'changed-page',bgTheme:'dark'},{id:'new-page'}]);
  const again=s.run();s.requests.voice[1].resolve([note('changed','remote'),note('new')]);s.requests.blank[1].resolve(s.pages);await again;
  assert.equal(s.voice.render().notes.length,2);assert.equal(s.pages.length,2);
});
test('blank snapshot keeps pending additions and later events, including deletion during read',async t=>{
  const s=roomSnapshots(t);s.pendingBlankSaves.current.add('pending');s.setPages([...s.pages,{id:'pending'}]);const run=s.run();
  s.blankSnapshots.current.touch('old-page');s.setPages(s.pages.filter(p=>p.id!=='old-page'));
  s.blankSnapshots.current.touch('changed-page');s.setPages(s.pages.map(p=>p.id==='changed-page'?{...p,bgTheme:'dark'}:p));
  s.requests.voice[0].resolve([]);s.requests.blank[0].resolve([{id:'old-page'},{id:'changed-page',bgTheme:'white'}]);await run;
  assert.deepEqual(s.pages,[{id:'changed-page',bgTheme:'dark'},{id:'pending'}]);
});
test('failed snapshot reads retry once and never interpret failure as deletion',async t=>{
  t.mock.method(console,'warn',()=>{});const s=roomSnapshots(t);const run=s.run();
  s.requests.voice[0].reject(Error('offline'));s.requests.blank[0].reject(Error('offline'));await new Promise(setImmediate);
  s.requests.voice[1].reject(Error('offline'));s.requests.blank[1].reject(Error('offline'));await run;
  assert.equal(s.requests.voice.length,2);assert.equal(s.requests.blank.length,2);
  assert.equal(s.voice.render().notes.length,2);assert.equal(s.pages.length,2);
  const next=s.run();s.requests.voice[2].resolve([]);s.requests.blank[2].resolve([]);await next;
  assert.equal(s.voice.render().notes.length,0);assert.equal(s.pages.length,0);
});
test('room/account lifetime invalidation suppresses delayed snapshots and retries',async t=>{
  const s=roomSnapshots(t);const run=s.run();s.snapshotLifetime.current.active=false;
  s.requests.voice[0].resolve([]);s.requests.blank[0].reject(Error('old account'));await run;
  assert.equal(s.requests.blank.length,1);assert.equal(s.voice.render().notes.length,2);assert.equal(s.pages.length,2);
});
test('an older successful blank fetch cannot replace a newer reconnect result',async t=>{
  const s=roomSnapshots(t);const first=s.run();const second=s.run();
  s.requests.voice[1].resolve([note('new')]);s.requests.blank[1].resolve([{id:'new-page'}]);await second;
  s.requests.voice[0].resolve([note('old')]);s.requests.blank[0].resolve([{id:'old-page'}]);await first;
  assert.deepEqual(s.voice.render().notes.map(n=>n.id),['new']);assert.deepEqual(s.pages,[{id:'new-page'}]);
});
for(const method of ['fetchRoomVoiceNotes','fetchRoomBlankPages']) for (const count of [1, null]) test(`${method} rejects truncated/unknown-count (${count}) snapshots before missing rows can be treated as deletions`,async()=>{
  const query={select(){return this},eq(){return this},order:async()=>({data:[],count,error:null})};
  const db=loadSource('src/lib/supabase/roomAnnotations.ts',{'./dbShared':{sb:()=>({from:()=>query})}});
  await assert.rejects(db[method]('room'),/incomplete/i);
});
test('failed blank creation rejects so its local pending marker cannot be acknowledged',async()=>{
  const db=loadSource('src/lib/supabase/roomAnnotations.ts',{'./dbShared':{userId:async()=> 'me',sb:()=>({from:()=>({upsert:async()=>({error:{message:'offline'}})})})}});
  await assert.rejects(db.saveRoomBlankPage('room',{id:'page',insertAfterPage:1,bgTheme:'white',createdAt:0}),/offline/);
});
test('remote confirmation releases a failed blank-create marker for future authoritative deletions',async t=>{
  const s=roomSnapshots(t);s.pendingBlankSaves.current.add('local');s.setPages([{id:'local'}]);
  const first=s.run();s.requests.voice[0].resolve([]);s.requests.blank[0].resolve([{id:'local'}]);await first;
  assert.equal(s.pages.length,1);assert.equal(s.pendingBlankSaves.current.size,0);
  const next=s.run();s.requests.voice[1].resolve([]);s.requests.blank[1].resolve([]);await next;assert.equal(s.pages.length,0);
});

test('a delayed old-room callback cannot borrow the replacement room lifetime', async t => {
  const voice = setup(t);
  const { createRoomSnapshotGate } = loadSource('src/lib/roomSnapshot.ts');
  const snapshotLifetime = { current: { active: true, roomId: 'A' } };
  const beginVoice = { current: null };
  const blanks = { current: createRoomSnapshotGate() };
  let pages = [];
  const reads = [];
  const source = fs.readFileSync('src/app/room/[roomId]/RoomClient.tsx', 'utf8');
  const start = source.indexOf('  const reconcileRoomSnapshots =');
  const end = source.indexOf('  const handleReconnect =', start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const callback = room => new Function('useCallback', 'roomId', 'snapshotLifetime', 'beginVoiceSnapshotRef', 'blankSnapshots', 'pendingBlankSaves', 'voiceNoteRequestsRef', 'fetchRoomVoiceNotes', 'fetchRoomBlankPages', 'setRoomBlankPages', code + ';return reconcileRoomSnapshots;')(
    fn => fn, room, snapshotLifetime, beginVoice, blanks, { current: new Set() }, { current: new Map() },
    async id => { reads.push(id); return [note(id + '-note')]; },
    async id => [{ id: id + '-page' }], update => { pages = update(pages); });
  voice.render('A'); beginVoice.current = voice.render('A').beginReconcileNotes;
  const oldCallback = callback('A');
  snapshotLifetime.current.active = false;
  snapshotLifetime.current = { active: true, roomId: 'B' };
  voice.render('B'); beginVoice.current = voice.render('B').beginReconcileNotes;
  await callback('B')();
  await oldCallback();
  assert.deepEqual(reads, ['B'], 'obsolete callback must not begin a snapshot or supersede current reads');
  assert.deepEqual(voice.render('B').notes.map(n => n.id), ['B-note']);
  assert.deepEqual(pages, [{ id: 'B-page' }]);
});
