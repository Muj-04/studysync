const {test}=require('node:test'); const assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
function setup() {
 const data=new Map(); const cache=new Map();
 const KEYS={DRAWINGS:'drawings',TEXT_NOTES:'text',BLANK_PAGES:'blank',PAGE_IMAGES:'images',BOOKMARKS:'bookmarks'};
 const mocks={'@/lib/storage':{KEYS,storageKeys:p=>[...data.keys()].filter(k=>k.startsWith(p)),storageGet:k=>structuredClone(data.get(k)??null),storageSet:(k,v)=>{data.set(k,structuredClone(v));return true;},storageRemove:k=>data.delete(k)}};
 const outbox=loadSource('src/lib/documentOutbox.ts',mocks,cache);
 const hydration=loadSource('src/lib/documentHydration.ts',mocks,cache);
 const scope={ownerId:'A',documentId:'doc',generation:'gen',collection:'drawings',pageKey:'1'};
 return {data,outbox,hydration,scope,mocks,cache};
}
test('cached editor cannot use an early collection response before sibling reads finish',()=>{
 const f=setup(); f.data.set('drawings',{'doc:1':'cached'});
 const batch=f.hydration.beginDocumentHydration('A','doc',['drawings']);
 batch.accept('drawings',[{page_key:'1',canvas_data:'remote'}],()=>f.outbox.observeDocumentCollection(f.scope,5));
 assert.equal(f.outbox.stageDocumentWrite(f.scope,[{canvas_data:'cached edit'}]).expectedRevision,null);
 batch.complete();
 assert.equal(f.outbox.listDocumentWrites('A')[0].expectedRevision,null);
});
test('cancelled hydration cannot certify cached content',()=>{
 const f=setup(); f.data.set('drawings',{'doc:1':'cached'});
 const batch=f.hydration.beginDocumentHydration('A','doc',['drawings']);
 batch.cancel(); batch.accept('drawings',[{page_key:'1',canvas_data:'remote'}],()=>f.outbox.observeDocumentCollection(f.scope,5)); batch.complete();
 assert.equal(f.outbox.stageDocumentWrite(f.scope,[{canvas_data:'cached edit'}]).expectedRevision,null);
});
test('successful hydration admits present clean scopes but keeps missing cached pages blocked',()=>{
 const f=setup(); f.data.set('drawings',{'doc:1':'old','doc:2':'deleted remotely'});
 const batch=f.hydration.beginDocumentHydration('A','doc',['drawings']);
 batch.accept('drawings',[{page_key:'1',canvas_data:'remote'}],()=>{f.outbox.observeDocumentCollection(f.scope,5);f.outbox.observeDocumentCollection({...f.scope,pageKey:'2'},6);});
 batch.complete();
 assert.equal(f.outbox.stageDocumentWrite(f.scope,[{canvas_data:'new edit'}]).expectedRevision,5);
 assert.equal(f.outbox.stageDocumentWrite({...f.scope,pageKey:'2'},[{canvas_data:'stale'}]).expectedRevision,null);
});
test('bookmark merge with local-only marks cannot certify the merged replacement',()=>{
 const f=setup(); f.data.set('bookmarks',{doc:[{id:'deleted'}]});
 const scope={...f.scope,collection:'bookmarks',pageKey:''};
 const batch=f.hydration.beginDocumentHydration('A','doc',['bookmarks']);
 batch.accept('bookmarks',[{id:'remote'}],()=>f.outbox.observeDocumentCollection(scope,5)); batch.complete();
 assert.equal(f.outbox.stageDocumentWrite(scope,[{id:'deleted'},{id:'remote'}]).expectedRevision,null);
});

test('filtered empty drawing rows do not certify the retained cached drawing',()=>{
 const f=setup(); f.data.set('drawings',{'doc:1':'cached'});
 const batch=f.hydration.beginDocumentHydration('A','doc',['drawings']);
 batch.accept('drawings',[{page_key:'1',canvas_data:null}],()=>f.outbox.observeDocumentCollection(f.scope,5)); batch.complete();
 assert.equal(f.outbox.stageDocumentWrite(f.scope,[{canvas_data:'cached edit'}]).expectedRevision,null);
});

test('queued text seeds are not certified until their React render commits',()=>{
 const {createHookHarness}=require('./hook-harness.cjs'); const h=createHookHarness(); const f=setup();
 f.data.set('text',{'doc:1':[{id:'note',content:'cached'}]});
 const mocks={...f.mocks,react:h.react,'@/lib/supabase/db':{saveTextNotes:async()=>{}}};
 const {useTextNotes}=loadSource('src/hooks/useTextNotes.ts',mocks,f.cache);
 const {useDocumentHydrationCommit}=loadSource('src/hooks/useDocumentHydrationCommit.ts',mocks,f.cache);
 const render=()=>h.render(()=>({notes:useTextNotes('A'),commit:useDocumentHydrationCommit()})); render(); const ui=render();
 const scope={...f.scope,collection:'text_notes'};
 const batch=f.hydration.beginDocumentHydration('A','doc',['text_notes']);
 batch.accept('text_notes',[{page_key:'1'}],()=>f.outbox.observeDocumentCollection(scope,5));
 ui.notes[2]({'doc:1':[{id:'note',content:'remote'}]}); ui.commit(batch);
 ui.notes[1]({'doc:1':[{id:'note',content:'cached edited before render'}]});
 assert.equal(f.outbox.stageDocumentWrite(scope,[{content:'cached edited before render'}]).expectedRevision,null);
 assert.equal(render().notes[0]['doc:1'][0].content,'cached edited before render');
 assert.equal(f.outbox.listDocumentWrites('A')[0].expectedRevision,null);
 h.unmount();
});
