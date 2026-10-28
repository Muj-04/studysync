const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const tick = () => new Promise(setImmediate);
const { fixture } = require('./recording-fixture.cjs');
for (const kind of ['room', 'document']) {
  for (const stage of ['upload','sign','database']) test(`${kind} ${stage} failure is tracked and retry publishes exactly one playable recording`, async () => {
    const f=fixture(kind); f.state.fail=stage;
    await assert.rejects(f.save());
    assert.equal(f.rows.size,0);
    assert.match(JSON.stringify(f.values), /note/);
    f.state.fail=''; await f.save();
    assert.equal(f.rows.size,1); assert.ok(f.rows.get('note').audio_url);
    assert.ok(f.calls.filter(c=>c[0]==='upload').every(c=>c[2]===false));
  });
  test(`${kind} cannot upload when durable recovery storage is unavailable`, async () => {
    const f=fixture(kind); f.state.denyStorage=true;
    await assert.rejects(f.save(), /recovery|storage/i);
    assert.equal(f.calls.length,0);
  });
  test(`${kind} duplicate save and lost publication response preserve published audio`, async () => {
    const f=fixture(kind); f.state.fail='lost-publish';
    await f.save();
    f.state.fail=''; await f.save();
    assert.equal(f.calls.filter(c=>c[0]==='upload').length,1);
    assert.equal(f.rows.size,1); assert.equal(f.objects.size,1);
    assert.equal(f.calls.filter(c=>c[0]==='remove').length,0);
  });
  test(`${kind} metadata delete failure leaves playable audio and retry completes cleanup`, async () => {
    const f=fixture(kind); await f.save(); f.state.fail='database-delete';
    await assert.rejects(f.remove());
    assert.equal(f.rows.size,1); assert.equal(f.objects.size,1);
    f.state.fail=''; await f.remove();
    assert.equal(f.rows.size,0); assert.equal(f.objects.size,0);
    await assert.rejects(f.save(), /delet/i);
  });
  test(`${kind} failed storage cleanup is tracked and retry does not restore metadata`, async () => {
    const f=fixture(kind); await f.save(); f.state.fail='remove';
    await assert.rejects(f.remove());
    assert.equal(f.rows.size,0); assert.equal(f.objects.size,1);
    assert.match(JSON.stringify(f.values), /delete/);
    f.state.fail=''; await f.remove(); assert.equal(f.objects.size,0);
  });
  test(`${kind} lost deletion response is reconciled before removing audio`, async () => {
    const f=fixture(kind); await f.save(); f.state.fail='lost-delete';
    await f.remove(); assert.equal(f.rows.size,0); assert.equal(f.objects.size,0);
  });
  test(`${kind} save/delete race finishes deleted and blocks late retry`, async () => {
    const f=fixture(kind); let release; f.state.gate=new Promise(r=>release=r);
    const saving=f.save(); await tick(); const deleting=f.remove(); await tick();
    release(); await Promise.all([saving,deleting]);
    assert.equal(f.rows.size,0); assert.equal(f.objects.size,0);
    await assert.rejects(f.save(), /delet/i);
  });
  test(`${kind} account switch during upload blocks publication and retains owner recovery`, async () => {
    const f=fixture(kind); let release; f.state.gate=new Promise(r=>release=r);
    const saving=f.save(); await tick(); f.state.uid='bob'; release();
    await assert.rejects(saving, /account|sign/i);
    assert.equal(f.rows.size,0);
    assert.match(JSON.stringify(f.values), /alice/);
    assert.equal(f.calls.filter(c=>c[0]==='remove').length,0);
  });
}

for (const kind of ['room','document']) {
  test(`${kind} lost upload response remains recoverable without reupload`, async () => {
    const f=fixture(kind); f.state.fail='lost-upload'; await assert.rejects(f.save());
    assert.equal(f.objects.size,1); f.state.fail=''; await f.recovery();
    assert.equal(f.rows.size,1); assert.equal(f.calls.filter(c=>c[0]==='upload').length,1);
  });
  test(`${kind} automatic recovery does not republish after an uncertain insert and subsequent remote deletion`, async () => {
    const f=fixture(kind); f.state.fail='lost-publish-read'; await assert.rejects(f.save());
    assert.equal(f.rows.size,1); f.rows.clear(); f.objects.clear(); f.state.failReads=false; f.state.fail='';
    await f.recovery(); assert.equal(f.rows.size,0); assert.equal(f.objects.size,0);
    await assert.rejects(f.save(), /confirm|publication|copy/i); assert.equal(f.rows.size,0); assert.equal(f.objects.size,0);
    assert.match(JSON.stringify(f.values), /note/);
  });
  test(`${kind} another account cannot replay prior owner cleanup`, async () => {
    const f=fixture(kind); await f.save(); f.state.fail='remove'; await assert.rejects(f.remove());
    f.state.uid='bob'; f.state.fail=''; await f.recovery(); assert.equal(f.objects.size,1);
    f.state.uid='alice'; await f.recovery(); assert.equal(f.objects.size,0);
  });
}

test('sign-out preserves opaque recording recovery entries but clears user content', async t => {
  const values = new Map([['studysync_recording_recovery_alice','{"pending":"opaque"}'], ['studysync_voicenotes','audio'], ['studysync_textnotes','text']]);
  const prior = global.localStorage;
  global.localStorage = { get length() { return values.size; }, key: i => [...values.keys()][i], removeItem: k => values.delete(k) };
  t.after(()=>{global.localStorage=prior;});
  const {clearLocalUserData}=loadSource('src/lib/clearLocalUserData.ts', {'./pendingReopenFile':{clearPendingReopenFile:async()=>{}}});
  await clearLocalUserData();
  assert.deepEqual([...values.keys()], ['studysync_recording_recovery_alice']);
});

test('personal save remains bound to its initiating account across parent registration', async () => {
  const f=fixture('document'); let release; f.state.registrationGate=new Promise(r=>release=r);
  const saving=f.save(); await tick(); f.state.uid='bob'; release();
  await assert.rejects(saving, /account/i); assert.equal(f.calls.length,0);
});

test('recovery retains a pending recording title without storing signed URLs or audio', async () => {
  const f=fixture(); f.note.title='Lecture recap'; f.state.fail='sign'; await assert.rejects(f.save());
  assert.match(JSON.stringify(f.values), /Lecture recap/);
  assert.doesNotMatch(JSON.stringify(f.values), /token=|audioBlob/);
  f.state.fail=''; await f.recovery(); assert.equal(f.rows.get('note').title,'Lecture recap');
});
for (const kind of ['room','document']) test(`${kind} a stale save cannot recreate a previously published recording deleted remotely`, async()=>{
  const f=fixture(kind);await f.save();f.rows.clear();
  await assert.rejects(f.save(), /delet|published/i);assert.equal(f.rows.size,0);
});

test('bulk personal deletion preserves audio on metadata failure and includes unpublished tracked uploads', async()=>{
  const f=fixture('document');await f.save();f.state.fail='database-delete';
  await assert.rejects(f.removeAll());assert.equal(f.objects.size,1);assert.equal(f.rows.size,1);
  f.state.fail='';await f.removeAll();assert.equal(f.objects.size,0);
  f.note.id='unpublished';f.state.fail='sign';await assert.rejects(f.save());assert.equal(f.objects.size,1);
  f.state.fail='';await f.removeAll();assert.equal(f.objects.size,0);
  await f.recovery();assert.equal(f.rows.size,0);
});

test('bounded recovery advances beyond permanently failed earlier uploads', async()=>{
  const f=fixture();f.state.fail='upload';
  for(let i=0;i<20;i++){f.note.id='missing-'+i;await assert.rejects(f.save());}
  f.note.id='recoverable';f.state.fail='sign';await assert.rejects(f.save());
  f.state.fail='';await f.recovery();await f.recovery();assert.ok(f.rows.has('recoverable'));
});
test('bulk deletion refuses a truncated recording list before deleting any row or object', async()=>{
  const f=fixture('document');await f.save();f.note.id='second';await f.save();f.state.readLimit=1;
  await assert.rejects(f.removeAll(),/incomplete/i);assert.equal(f.rows.size,2);assert.equal(f.objects.size,2);
});

test('tracked storage cleanup can finish after the parent document deletion barrier is set', async()=>{
  const f=fixture('document');await f.save();f.state.fail='remove';
  await assert.rejects(f.removeDocumentAll());assert.equal(f.rows.size,0);assert.equal(f.objects.size,1);
  f.state.fail='';await f.recovery();assert.equal(f.objects.size,0);assert.equal(f.rows.size,0);
});
test('blocked document publication retries do not starve later recoverable documents', async()=>{
  const f=fixture('document');f.state.fail='upload';
  for(let i=0;i<20;i++){f.note.documentId='blocked-'+i;await assert.rejects(f.save());await f.blockDocument(f.note.documentId);}
  f.note.documentId='scope';f.note.id='recoverable';f.state.fail='sign';await assert.rejects(f.save());
  f.state.fail='';await f.recoverAll();await f.recoverAll();assert.ok(f.rows.has('recoverable'));
});
test('unavailable recovery journal does not turn a recording read into a failure or start new mutations', async()=>{
  const f=fixture();f.state.fail='sign';await assert.rejects(f.save());
  f.state.fail='';f.state.denyStorage=true;const before=f.calls.length;
  await assert.doesNotReject(f.recovery());assert.equal(f.calls.length,before);assert.equal(f.objects.size,1);
});
