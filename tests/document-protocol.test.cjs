const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
function fixture() {
  let owner = 'owner'; const values = new Map(); const rows = new Map(); const deleted = new Set(); const writes = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, from(table) {
    let filters = {}; let payload;
    const query = { select() { return this; }, eq(k,v) { filters[k]=v; return this; },
      insert(data) { payload=data; return this; }, upsert(data) { payload=data; return this; },
      async maybeSingle() { return { data: table === 'document_tombstones' ? (deleted.has(filters.document_id) ? { document_id:filters.document_id } : null) : rows.get(filters.id) ?? null, error:null }; },
      then(resolve) { if (payload) { writes.push(payload); rows.set(payload.id,payload); } return Promise.resolve({ error:null }).then(resolve); } };
    return query;
  }};
  const previous=global.localStorage; global.localStorage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const api=loadSource('src/lib/supabase/documentProtocol.ts', {'./client':{createClient:()=>client}});
  return { api,rows,deleted,writes,values,owner:v=>owner=v,restore:()=>global.localStorage=previous };
}
test('deleted registration never inserts a missing original', async()=>{
 const f=fixture(); try { f.deleted.add('doc'); await assert.rejects(f.api.registerDocument('owner',{id:'doc',name:'x',type:'pdf'}), /deleted/i); assert.equal(f.writes.length,0); }finally{f.restore();}
});
test('registration retains a generation across lost response retries',async()=>{
 const f=fixture(); try{ const a=await f.api.registerDocument('owner',{id:'doc',name:'x',type:'pdf'}); const b=await f.api.registerDocument('owner',{id:'doc',name:'x',type:'pdf'}); assert.equal(a,b); assert.equal(f.writes[0].generation,a); }finally{f.restore();}
});
test('a queued registration cannot use a replacement account',async()=>{
 const f=fixture(); try{ f.owner('other'); await assert.rejects(f.api.registerDocument('owner',{id:'doc',name:'x',type:'pdf'}),/account/i); assert.equal(f.writes.length,0); }finally{f.restore();}
});
test('existing generation is adopted once, never rebound to another lifetime',async()=>{
 const f=fixture(); try{f.rows.set('doc',{id:'doc',user_id:'owner',generation:'first'}); assert.equal(await f.api.requireDocumentGeneration('owner','doc'),'first'); f.rows.set('doc',{id:'doc',user_id:'owner',generation:'second'}); await assert.rejects(f.api.registerDocument('owner',{id:'doc',name:'x',type:'pdf'}),/generation|conflict/i); assert.equal(f.writes.length,0);}finally{f.restore();}
});
test('annotation preparation cannot implicitly create a missing parent',async()=>{
 const f=fixture(); try { await assert.rejects(f.api.requireDocumentGeneration('owner','never-uploaded'),/registered|missing/i); assert.equal(f.writes.length,0); }finally{f.restore();}
});

test('remote deletion exposes legacy cached edits for recovery even without a new outbox entry',async()=>{
 const f=fixture();try{f.values.set('studysync_drawings',JSON.stringify({'doc:1':'legacy unsynced strokes'}));f.deleted.add('doc');await assert.rejects(f.api.registerDocument('owner',{id:'doc',name:'old.pdf',type:'pdf'}),/deleted/i);const retained=[...f.values.entries()].filter(([key])=>key.startsWith('studysync_document_recovery_'));assert.ok(retained.some(([,value])=>value.includes('legacy unsynced strokes')));assert.equal(f.writes.length,0);}finally{f.restore();}
});

test('repeated tombstone discovery after cache cleanup cannot erase its recovery archive',async()=>{
 const f=fixture();try{f.values.set('studysync_drawings',JSON.stringify({'doc:1':'retained legacy strokes'}));f.deleted.add('doc');await assert.rejects(f.api.registerDocument('owner',{id:'doc',name:'old.pdf',type:'pdf'}));f.values.delete('studysync_drawings');await assert.rejects(f.api.registerDocument('owner',{id:'doc',name:'old.pdf',type:'pdf'}));assert.ok([...f.values.entries()].filter(([key])=>key.startsWith('studysync_document_recovery_')).some(([,value])=>value.includes('retained legacy strokes')));assert.equal(f.writes.length,0);}finally{f.restore();}
});

test('distinct partial cache archives survive discovery and identical captures are deduplicated',async()=>{
 const f=fixture();try{f.deleted.add('doc');const discover=()=>assert.rejects(f.api.registerDocument('owner',{id:'doc',name:'old.pdf',type:'pdf'}));f.values.set('studysync_drawings',JSON.stringify({'doc:1':'page one'}));await discover();f.values.set('studysync_drawings',JSON.stringify({'doc:2':'page two'}));await discover();const archives=()=>[...f.values.entries()].filter(([key])=>key.startsWith('studysync_document_recovery_'));assert.ok(archives().some(([,value])=>value.includes('page one')));assert.ok(archives().some(([,value])=>value.includes('page two')));const count=archives().length;await discover();assert.equal(archives().length,count);}finally{f.restore();}
});
