const {test}=require('node:test');const assert=require('node:assert/strict');const {loadSource}=require('./load-source.cjs');
function setup(){
 const values=new Map();let owner='a';let remoteRevision=3;let rows=[];let lost=false;const requests=[];const receipts=new Map();
 const client={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async(name,args)=>{
  if(name==='read_document_collection_v2')return{data:{rows,revisions:{'1':remoteRevision}},error:null};
  requests.push(args);if(receipts.has(args.p_write_id))return{data:receipts.get(args.p_write_id),error:null};
  if(args.p_expected_revision!==remoteRevision)return{error:{code:'PDC01',message:'DOCUMENT_CONFLICT'}};
  rows=args.p_rows;remoteRevision++;receipts.set(args.p_write_id,remoteRevision);
  if(lost){lost=false;throw Error('response lost');}return{data:remoteRevision,error:null};
 }};
 const api=loadSource('src/lib/supabase/documentCollections.ts',{
 './client':{createClient:()=>client},'./documentProtocol':{
  knownDocumentGeneration:()=> 'generation',requireDocumentGeneration:async()=> 'generation',
  assertDocumentOwner:async expected=>{if(owner!==expected)throw Error('account changed');},
  DocumentConflictError:class extends Error{code='DOCUMENT_CONFLICT';}
 },'@/lib/storage':{storageGet:k=>values.has(k)?JSON.parse(values.get(k)):null,storageSet:(k,v)=>{values.set(k,JSON.stringify(v));return true;}}
 });
 return{api,requests,values,setOwner:v=>owner=v,remote:()=>{remoteRevision++;rows=[{content:'peer'}];},lose:()=>lost=true,rows:()=>rows};
}
test('unknown baseline retains edits without sending an overwrite',async()=>{
 const f=setup();await assert.rejects(f.api.writeDocumentCollection('text_notes','doc',[{content:'offline'}],'1','a'),/revision/i);assert.equal(f.requests.length,0);assert.match([...f.values.values()].join(''),/offline/);
});
test('a newer remote revision conflicts and retains local payload',async()=>{
 const f=setup();await f.api.readDocumentCollection('text_notes','doc');f.remote();await assert.rejects(f.api.writeDocumentCollection('text_notes','doc',[{content:'mine'}],'1','a'));assert.deepEqual(f.rows(),[{content:'peer'}]);assert.match([...f.values.values()].join(''),/mine/);
});
test('lost acknowledgement replays the same operation once without overwriting a peer',async()=>{
 const f=setup();await f.api.readDocumentCollection('text_notes','doc');f.lose();await assert.rejects(f.api.writeDocumentCollection('text_notes','doc',[{content:'mine'}],'1','a'),/lost/);f.remote();await f.api.retryPendingDocumentWrites('a');assert.equal(f.requests[0].p_write_id,f.requests[1].p_write_id);assert.deepEqual(f.rows(),[{content:'peer'}]);
});
test('account switch stops durable replay and leaves owner work intact',async()=>{
 const f=setup();await f.api.readDocumentCollection('text_notes','doc');f.lose();await assert.rejects(f.api.writeDocumentCollection('text_notes','doc',[{content:'mine'}],'1','a'));f.setOwner('b');await f.api.retryPendingDocumentWrites('a');assert.equal(f.requests.length,1);assert.match([...f.values.values()].join(''),/mine/);
});
