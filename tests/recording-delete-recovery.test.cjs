const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const {createHookHarness}=require('./hook-harness.cjs');
const tick=()=>new Promise(setImmediate);
function mount(t, remove) {
  const h=createHookHarness(); const alerts=[]; const oldAlert=global.alert; global.alert=m=>alerts.push(m);
  t.after(()=>{h.unmount();global.alert=oldAlert;});t.mock.method(console,'warn',()=>{});
  const {useVoiceNotes}=loadSource('src/hooks/useVoiceNotes.ts',{
    react:h.react,
    '@/lib/storage':{KEYS:{VOICE_NOTES:'notes'},storageGet:()=>null,storageSet:()=>true},
    '@/lib/supabase/client':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'alice'}}})}})},
    '@/lib/supabase/db':{fetchVoiceNotes:async()=>[{id:'note',documentId:'doc',pageNumber:1,duration:1,audioUrl:'https://audio.invalid/note',timestamp:'2026-10-28T00:00:00Z'}],deleteVoiceNote:remove,deleteAllVoiceNotesForDocument:remove},
  });
  const render=()=>h.render(useVoiceNotes); render();
  return {render,alerts,unmount:h.unmount};
}
test('failed personal deletion retains playable note and a later retry removes it',async t=>{
  let fail=true; const s=mount(t,async()=>{if(fail)throw Error('offline');});await tick();
  await s.render().deleteNote('note');assert.equal(s.render().notes.length,1);assert.equal(s.alerts.length,1);
  fail=false;await s.render().deleteNote('note');assert.equal(s.render().notes.length,0);
});
test('pending personal deletion does not remove local playback before confirmation',async t=>{
  let finish;const gate=new Promise(r=>finish=r);const s=mount(t,()=>gate);await tick();
  const deleting=s.render().deleteNote('note');assert.equal(s.render().notes.length,1);finish();await deleting;
  assert.equal(s.render().notes.length,0);
});

test('failed bulk personal deletion retains local playback for retry',async t=>{
  let fail=true;const s=mount(t,async()=>{if(fail)throw Error('offline');});await tick();
  await s.render().deleteNotesForDocument('doc');assert.equal(s.render().notes.length,1);
  fail=false;await s.render().deleteNotesForDocument('doc');assert.equal(s.render().notes.length,0);
});
