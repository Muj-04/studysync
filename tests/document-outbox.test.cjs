const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
function fixture(data=new Map()){let writable=true;const out=loadSource('src/lib/documentOutbox.ts',{'@/lib/storage':{storageKeys:prefix=>[...data.keys()].filter(k=>k.startsWith(prefix)),storageRemove:k=>data.delete(k),storageGet:k=>structuredClone(data.get(k)??null),storageSet:(k,v)=>{if(!writable)return false;data.set(k,structuredClone(v));return true;}}});return {...out,data,failStorage:()=>writable=false};}
const scope={ownerId:'A',documentId:'doc',generation:'gen',collection:'drawings',pageKey:'1'};
test('unknown baseline remains blocked after newer cloud snapshot',()=>{const f=fixture();const e=f.stageDocumentWrite(scope,[{data:'mine'}]);f.observeDocumentCollection(scope,9);assert.equal(f.listDocumentWrites('A')[0].expectedRevision,null);assert.equal(e.status,'blocked');});
test('delayed acknowledgement keeps newer payload and advances only local successor',()=>{const f=fixture();f.observeDocumentCollection(scope,3);const first=f.stageDocumentWrite(scope,[{data:'first'}]);const second=f.stageDocumentWrite(scope,[{data:'second'}]);f.observeDocumentCollection(scope,30);f.acknowledgeDocumentWrite(first,4);const pending=f.listDocumentWrites('A');assert.equal(pending.length,1);assert.equal(pending[0].writeId,second.writeId);assert.equal(pending[0].expectedRevision,4);assert.deepEqual(pending[0].rows,[{data:'second'}]);});
test('account switches cancel replay before next write and never expose other account',async()=>{const f=fixture();f.observeDocumentCollection(scope,0);f.stageDocumentWrite(scope,[1]);f.stageDocumentWrite({...scope,pageKey:'2'},[2]);let owner='A';let calls=0;await f.retryDocumentWrites('A',async()=>{calls++;owner='B';return 1;},async()=>owner);assert.equal(calls,1);assert.deepEqual(f.listDocumentWrites('B'),[]);assert.equal(f.listDocumentWrites('A').length,2);});
test('remote deletion retains payload and prevents automatic replay',async()=>{const f=fixture();f.observeDocumentCollection(scope,1);f.stageDocumentWrite(scope,[{data:'keep'}]);f.cancelDocumentWrites('A','doc','Document deleted');let calls=0;await f.retryDocumentWrites('A',async()=>{calls++;return 2;},async()=> 'A');assert.equal(calls,0);assert.deepEqual(f.listDocumentWrites('A')[0].rows,[{data:'keep'}]);});
test('journal storage failure prevents pretending staging succeeded',()=>{const f=fixture();f.failStorage();assert.throws(()=>f.stageDocumentWrite(scope,[1]),/storage/i);});
test('reconnect retries same write id and ack removes only confirmed entry',async()=>{const f=fixture();f.observeDocumentCollection(scope,2);const entry=f.stageDocumentWrite(scope,[1]);const ids=[];await f.retryDocumentWrites('A',async e=>{ids.push(e.writeId);throw Error('offline');},async()=> 'A');assert.equal(f.listDocumentWrites('A').length,1);await f.retryDocumentWrites('A',async e=>{ids.push(e.writeId);return 3;},async()=> 'A');assert.deepEqual(ids,[entry.writeId,entry.writeId]);assert.equal(f.listDocumentWrites('A').length,0);});
test('cancelled write keeps its payload after a delayed success acknowledgement',()=>{const f=fixture();f.observeDocumentCollection(scope,1);const entry=f.stageDocumentWrite(scope,[{ink:'keep'}]);f.cancelDocumentWrites('A','doc','deleted');f.acknowledgeDocumentWrite(entry,2);assert.equal(f.listDocumentWrites('A').length,1);assert.equal(f.listDocumentWrites('A')[0].status,'conflict');});
test('bounded replay advances past permanently failed first twenty scopes',async()=>{const f=fixture();for(let i=0;i<21;i++){const s={...scope,pageKey:String(i)};f.observeDocumentCollection(s,0);f.stageDocumentWrite(s,[i]);}const calls=[];const execute=async entry=>{calls.push(entry.pageKey);if(entry.pageKey!=='20')throw Error('offline');return 1;};await f.retryDocumentWrites('A',execute,async()=> 'A');await f.retryDocumentWrites('A',execute,async()=> 'A');assert.ok(calls.includes('20'));assert.equal(f.listDocumentWrites('A').length,20);});
test('malformed stored write fails closed rather than disappearing from recovery',()=>{const f=fixture();f.data.set('studysync_document_outbox_A:write:broken',null);assert.throws(()=>f.listDocumentWrites('A'),/unreadable/i);});

test('a peer tab read cannot advance the revision behind a stale editor', () => {
  const data = new Map(); const stale = fixture(data); const peer = fixture(data);
  stale.observeDocumentCollection(scope, 3);
  peer.observeDocumentCollection(scope, 4);
  assert.equal(stale.stageDocumentWrite(scope, [{ content: 'stale' }]).expectedRevision, 3);
});
test('a peer acknowledgement cannot rebase a stale tab successor', () => {
  const data = new Map(); const first = fixture(data); const stale = fixture(data);
  first.observeDocumentCollection(scope, 3); stale.observeDocumentCollection(scope, 3);
  const saved = first.stageDocumentWrite(scope, [{ content: 'new' }]);
  const pending = stale.stageDocumentWrite(scope, [{ content: 'stale' }]);
  first.acknowledgeDocumentWrite(saved, 4);
  assert.equal(stale.listDocumentWrites('A').find(write => write.writeId === pending.writeId).expectedRevision, 3);
});
test('a reloaded tab cannot treat a persisted baseline as an observed snapshot', () => {
  const data = new Map(); fixture(data).observeDocumentCollection(scope, 4);
  const reloaded = fixture(data);
  assert.equal(reloaded.stageDocumentWrite(scope, [{ content: 'cached edit' }]).status, 'blocked');
});
test('another tab can replay a saved writer chain without rebasing its own editor', async () => {
  const data = new Map(); const source = fixture(data); const retrying = fixture(data);
  source.observeDocumentCollection(scope, 3); retrying.observeDocumentCollection(scope, 3);
  source.stageDocumentWrite(scope, [{ content: 'first' }]);
  const second = source.stageDocumentWrite(scope, [{ content: 'second' }]);
  await retrying.retryDocumentWrites('A', async () => 4, async () => 'A');
  assert.equal(retrying.listDocumentWrites('A').find(write => write.writeId === second.writeId).expectedRevision, 4);
  assert.equal(retrying.stageDocumentWrite(scope, [{ content: 'stale peer' }]).expectedRevision, 3);
});
test('legacy writes remain retryable but their unproven successors are not rebased', async () => {
  const f = fixture(); f.observeDocumentCollection(scope, 3);
  const first = f.stageDocumentWrite(scope, [1]); const second = f.stageDocumentWrite(scope, [2]);
  for (const [key, value] of f.data) if (value?.writeId) { delete value.writerId; f.data.set(key, value); }
  await f.retryDocumentWrites('A', async entry => { assert.equal(entry.writeId, first.writeId); return 4; }, async () => 'A');
  assert.equal(f.listDocumentWrites('A').find(write => write.writeId === second.writeId).expectedRevision, 3);
});
test('a refresh rejected by a locally edited view cannot advance its write baseline', () => {
  const f = fixture(); f.observeDocumentCollection(scope, 3);
  const saved = f.stageDocumentWrite(scope, [{ content: 'local' }]);
  f.acknowledgeDocumentWrite(saved, 4);
  f.observeDocumentCollection(scope, 5); // Hook retains its edited view rather than adopting rows.
  assert.equal(f.stageDocumentWrite(scope, [{ content: 'more local' }]).expectedRevision, 4);
});
test('a raw edit before debounce freezes the baseline before a hydration read completes', () => {
  const f = fixture(); f.observeDocumentCollection(scope, 3);
  f.markDocumentCollectionEdited('A', 'doc', 'drawings', '1');
  f.observeDocumentCollection(scope, 4);
  assert.equal(f.stageDocumentWrite(scope, [{ content: 'raw edit' }]).expectedRevision, 3);
});
test('first raw edit on an empty adopted page captures its pre-edit zero baseline', () => {
  const f=fixture();
  f.observeDocumentCollectionSnapshot(scope, {});
  f.markDocumentCollectionEdited('A','doc','drawings','1');
  assert.equal(f.stageDocumentWrite(scope,[{canvas_data:'first stroke'}]).expectedRevision,0);
});
test('an empty snapshot adopted after a raw edit cannot manufacture its baseline', () => {
  const f=fixture();
  f.markDocumentCollectionEdited('A','doc','drawings','1');
  f.observeDocumentCollectionSnapshot(scope, {});
  assert.equal(f.stageDocumentWrite(scope,[{canvas_data:'early stroke'}]).expectedRevision,null);
});
