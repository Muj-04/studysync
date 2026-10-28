// Explicit local-only PostgreSQL integration test. It creates and drops its own
// disposable database; ordinary npm test uses the PGlite regression suite.
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const run = promisify(execFile);
const binary = process.env.STUDYSYNC_PSQL;
assert.ok(binary, 'STUDYSYNC_PSQL must name the local psql binary');
assert.ok(process.env.PGHOST?.startsWith('/tmp/'), 'Only an explicitly configured local Unix socket is permitted');
const database = `integrity_documents_${process.pid}`;
const owner = '11111111-1111-4111-8111-111111111111';
const free = '33333333-3333-4333-8333-333333333333';
const quote = text => `'${String(text).replaceAll("'", "''")}'`;
let sequence = 0;
class Session {
  constructor(name) {
    this.name = name; this.buffer = ''; this.pending = null;
    this.process = spawn('/bin/sh', ['-c', 'exec "$1" -X -qAt -v ON_ERROR_STOP=0 "$2" 2>&1', 'psql-session', binary, database], { env: process.env, stdio: ['pipe','pipe','pipe'] });
    this.process.stdout.setEncoding('utf8');
    this.process.stdout.on('data', chunk => {
      this.buffer += chunk;
      if (!this.pending) return;
      const marker = `${this.pending.marker}\n`; const index = this.buffer.indexOf(marker);
      if (index < 0) return;
      const output = this.buffer.slice(0,index).trim(); this.buffer = this.buffer.slice(index+marker.length);
      const pending = this.pending; this.pending = null;
      const match = output.match(/ERROR:\s+([0-9A-Z]{5}):/);
      if (match) pending.reject(Object.assign(new Error(output), { code: match[1] })); else pending.resolve(output);
    });
    this.process.on('exit', code => { if (this.pending) this.pending.reject(new Error(`psql exited ${code}: ${this.buffer}`)); });
  }
  query(sql) {
    assert.equal(this.pending,null,'queries on an individual connection must be sequential');
    return new Promise((resolve,reject) => {
      const marker = `__complete_${++sequence}__`;
      this.pending = { marker,resolve,reject }; this.process.stdin.write(`${sql}\n\\echo ${marker}\n`);
    });
  }
  async initialize() {
    await this.query(`\\set VERBOSITY verbose\nSET application_name=${quote(this.name)}; SET statement_timeout='12s'; SET lock_timeout='10s'; SET ROLE authenticated; SET test.uid=${quote(owner)}; SET test.role='authenticated';`);
  }
  close() { return new Promise(resolve => { this.process.on('exit',resolve); this.process.stdin.end('\\q\n'); }); }
}
const sessions=[];
async function blocked(observer,name) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline) {
    if((await observer.query(`RESET ROLE; SELECT wait_event_type FROM pg_stat_activity WHERE application_name=${quote(name)}; SET ROLE authenticated;`)).includes('Lock')) return;
    await new Promise(resolve=>setTimeout(resolve,15));
  }
  assert.fail(`${name} did not reach the expected independent-connection lock wait`);
}
const pending = promise => promise.then(value=>({value}),error=>({error}));
const writeSQL = (doc,gen,write,content,revision=0) => `SELECT replace_study_collection_v2('text_notes',${quote(doc)},${quote(gen)},'1',${revision},${quote(write)},${quote(JSON.stringify([{id:`note-${doc}`,content}]))}::jsonb);`;
(async()=>{
  await run(binary,['-X','-q','-v','ON_ERROR_STOP=1','-d','postgres','-c',`CREATE DATABASE ${database}`]);
  try {
    await run(binary,['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f','tests/fixtures/document-generation-base.sql']);
    await run(binary,['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f','supabase/migrations/20261028202847_document_generation_guards.sql']);
    const a=new Session('integrity-a'),b=new Session('integrity-b'),c=new Session('integrity-observer'); sessions.push(a,b,c);
    await Promise.all(sessions.map(session=>session.initialize()));
    const create=async id=>a.query(`INSERT INTO documents(id,user_id) VALUES(${quote(id)},${quote(owner)}) RETURNING generation;`);

    let gen=await create('write-before-delete');
    await a.query(`BEGIN; ${writeSQL('write-before-delete',gen,randomUUID(),'saved')}`);
    let waiting=pending(b.query("DELETE FROM documents WHERE id='write-before-delete';"));
    await blocked(c,b.name); await a.query('COMMIT;'); assert.equal((await waiting).error,undefined);
    assert.equal(await c.query("SELECT count(*) FROM text_notes WHERE document_id='write-before-delete';"),'0');
    assert.equal(await c.query("SELECT count(*) FROM document_tombstones WHERE document_id='write-before-delete';"),'1');
    console.log('PASS separate connections: child write completes before deletion; cascade and tombstone win');

    gen=await create('delete-before-upsert');
    await a.query("BEGIN; DELETE FROM documents WHERE id='delete-before-upsert';");
    waiting=pending(b.query(`INSERT INTO documents(id,user_id,generation) VALUES('delete-before-upsert',${quote(owner)},${quote(gen)}) ON CONFLICT(id) DO UPDATE SET name='stale';`));
    await blocked(c,b.name); await a.query('COMMIT;'); assert.equal((await waiting).error?.code,'PDD01');
    assert.equal(await c.query("SELECT count(*) FROM documents WHERE id='delete-before-upsert';"),'0');
    console.log('PASS separate connections: committed deletion rejects the waiting legacy upsert');

    gen=await create('delete-before-replay');
    await a.query("BEGIN; DELETE FROM documents WHERE id='delete-before-replay';");
    waiting=pending(b.query(writeSQL('delete-before-replay',gen,randomUUID(),'stale')));
    await blocked(c,b.name); await a.query('COMMIT;'); assert.equal((await waiting).error?.code,'PDD01');
    console.log('PASS separate connections: committed deletion rejects waiting generation-bound replay');

    gen=await create('cas-race');
    await a.query('BEGIN;'); const first=await a.query(writeSQL('cas-race',gen,randomUUID(),'winner'));
    waiting=pending(b.query(writeSQL('cas-race',gen,randomUUID(),'stale')));
    await blocked(c,b.name); await a.query('COMMIT;'); assert.equal((await waiting).error?.code,'PDC01');
    assert.equal(await c.query("SELECT content FROM text_notes WHERE document_id='cas-race';"),'winner');
    assert.ok(Number(first)>0);
    console.log('PASS separate connections: same-base competing replacements cannot both acknowledge');

    gen=await create('receipt-race'); const write=randomUUID(); const sql=writeSQL('receipt-race',gen,write,'one reward');
    await a.query('BEGIN;'); const acknowledgment=await a.query(sql); waiting=pending(b.query(sql));
    await blocked(c,b.name); await a.query('COMMIT;'); assert.equal((await waiting).value,acknowledgment);
    assert.equal(await c.query("SELECT count(*) FROM text_notes WHERE document_id='receipt-race';"),'1');
    console.log('PASS separate connections: concurrent lost-response retry returns the same receipt');

    gen=await create('repeatable-read');
    await a.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT id FROM documents WHERE id='repeatable-read';");
    await b.query("DELETE FROM documents WHERE id='repeatable-read';");
    const stale=await pending(a.query(`INSERT INTO documents(id,user_id,generation) VALUES('repeatable-read',${quote(owner)},${quote(gen)}) ON CONFLICT(id) DO UPDATE SET name='stale';`));
    assert.ok(['PDD01','40001'].includes(stale.error?.code),stale.error?.message); await a.query('ROLLBACK;');
    assert.equal(await c.query("SELECT count(*) FROM documents WHERE id='repeatable-read';"),'0');
    console.log('PASS separate connections: stale repeatable-read transactions cannot resurrect a deleted ID');

    await a.query(`SET test.uid=${quote(free)}; INSERT INTO documents(id,user_id) VALUES('quota-one',${quote(free)}),('quota-two',${quote(free)}); BEGIN; INSERT INTO documents(id,user_id) VALUES('quota-three',${quote(free)});`);
    await b.query(`SET test.uid=${quote(free)};`);
    waiting=pending(b.query(`INSERT INTO documents(id,user_id) VALUES('quota-four',${quote(free)});`));
    await blocked(c,b.name); await a.query('COMMIT;'); assert.equal((await waiting).error?.code,'PDQ01');
    assert.equal(await a.query('SELECT count(*) FROM documents;'),'3');
    await a.query(`SET test.uid=${quote(owner)};`); await b.query(`SET test.uid=${quote(owner)};`);
    console.log('PASS separate connections: concurrent document creation obeys the free quota');

    gen=await create('snapshot-pair');
    let revision=Number(await a.query(writeSQL('snapshot-pair',gen,randomUUID(),'2')));
    await Promise.all([
      (async()=>{for(let i=0;i<40;i++)revision=Number(await b.query(writeSQL('snapshot-pair',gen,randomUUID(),String(revision+3),revision)));})(),
      (async()=>{for(let i=0;i<50;i++){const snapshot=JSON.parse(await a.query(`SELECT read_document_collection_v2('text_notes','snapshot-pair',${quote(gen)});`)); assert.equal(Number(snapshot.rows[0].content),snapshot.revisions['1']);}})(),
    ]);
    console.log('PASS separate connections: concurrent CAS writes never split snapshot rows from revision');
  } finally {
    await Promise.all(sessions.map(session=>session.close()));
    await run(binary,['-X','-q','-v','ON_ERROR_STOP=1','-d','postgres','-c',`DROP DATABASE ${database}`]);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
