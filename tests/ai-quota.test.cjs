const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('only one request gets the final quota slot and failed requests refund once', async () => {
  const db = new PGlite();
  const uid = '11111111-1111-4111-8111-111111111111';
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES('${uid}');
    CREATE TABLE ai_usage(user_id uuid,month text,count integer,PRIMARY KEY(user_id,month));
    INSERT INTO ai_usage VALUES('${uid}','2026-10',14);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261004120000_reserve_ai_quota.sql','utf8'));
  try {
    const reserve = () => db.query('SELECT reserve_ai_request($1,$2,$3) id',[uid,'2026-10',15]);
    const results = await Promise.all([reserve(),reserve()]);
    const ids = results.map(r => r.rows[0].id).filter(Boolean);
    assert.equal(ids.length,1);
    assert.equal((await db.query('SELECT count FROM ai_usage')).rows[0].count,15);
    await db.query('SELECT refund_ai_request($1)',ids);
    await db.query('SELECT refund_ai_request($1)',ids);
    assert.equal((await db.query('SELECT count FROM ai_usage')).rows[0].count,14);
    assert.ok((await reserve()).rows[0].id);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(reserve(), /permission denied/);
  } finally { await db.close(); }
});


const { loadSource } = require('./load-source.cjs');

test('refund retries transient errors and rejects exhausted attempts', async () => {
  const { refundAiRequest, completeAiRequest } = loadSource('src/lib/aiQuota.ts');
  let calls = 0;
  await refundAiRequest({ rpc: async () => ({ error: ++calls < 3 ? { message: 'offline' } : null }) }, 'reservation');
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(refundAiRequest({ rpc: async () => { calls++; throw Error('offline'); } }, 'reservation'), /offline/);
  assert.equal(calls, 3);
  await assert.rejects(completeAiRequest({ rpc: async () => ({ data: false, error: null }) }, 'expired'), /expired/);
});

test('expired pending reservations recover quota after a process crash, but completed and legacy requests stay charged', async () => {
  const db = new PGlite();
  const uid = '11111111-1111-4111-8111-111111111111';
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES('${uid}');
    CREATE TABLE ai_usage(user_id uuid,month text,count integer,PRIMARY KEY(user_id,month));`);
  await db.exec(fs.readFileSync('supabase/migrations/20261004120000_reserve_ai_quota.sql','utf8'));
  const legacy = (await db.query('SELECT reserve_ai_request($1,$2,$3) id',[uid,'2026-10',3])).rows[0].id;
  await db.exec(fs.readFileSync('supabase/migrations/20261007090000_ai_quota_recovery.sql','utf8'));
  const reserve = async () => (await db.query('SELECT reserve_ai_request_v2($1,$2,$3) id',[uid,'2026-10',3])).rows[0].id;
  const count = async () => (await db.query('SELECT count FROM ai_usage')).rows[0].count;
  try {
    const completed = await reserve();
    assert.equal((await db.query('SELECT complete_ai_request($1) ok',[completed])).rows[0].ok,true);
    assert.equal((await db.query('SELECT complete_ai_request($1) ok',[completed])).rows[0].ok,true);
    await db.query('SELECT refund_ai_request($1)',[completed]);
    const abandoned = await reserve();
    assert.equal(await reserve(),null);
    // Crash/outage: no refund RPC ever reaches PostgreSQL. Expiry persists in the DB.
    await db.exec("UPDATE ai_request_reservations SET expires_at=now()-interval '1 minute'");
    const replacement = await reserve();
    assert.ok(replacement);
    assert.equal(await count(),3);
    assert.equal((await db.query('SELECT complete_ai_request($1) ok',[abandoned])).rows[0].ok,false);
    await db.query('SELECT refund_ai_request($1)',[abandoned]);
    assert.equal(await count(),3);
    const retained = (await db.query('SELECT id FROM ai_request_reservations')).rows.map(row => row.id);
    assert.ok(retained.includes(legacy)); assert.ok(retained.includes(completed));
    // Failed reconciliation rolls back; a later invocation can retry the same token.
    await db.query("UPDATE ai_request_reservations SET expires_at=now()-interval '1 minute' WHERE id=$1",[replacement]);
    await db.exec("CREATE FUNCTION reject_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'outage'; END; $$; CREATE TRIGGER reject_usage BEFORE UPDATE ON ai_usage FOR EACH ROW EXECUTE FUNCTION reject_usage();");
    await assert.rejects(db.query('SELECT reconcile_ai_requests($1)',[uid]), /outage/);
    assert.equal((await db.query('SELECT count(*)::int n FROM ai_request_reservations WHERE id=$1',[replacement])).rows[0].n,1);
    await db.exec('DROP TRIGGER reject_usage ON ai_usage');
    assert.equal((await db.query('SELECT reconcile_ai_requests($1) n',[uid])).rows[0].n,1);
    assert.equal((await db.query('SELECT reconcile_ai_requests($1) n',[uid])).rows[0].n,0);
    assert.equal(await count(),2);
    const expired = await reserve();
    await db.query("UPDATE ai_request_reservations SET expires_at=now()-interval '1 minute' WHERE id=$1",[expired]);
    assert.equal((await db.query('SELECT complete_ai_request($1) ok',[expired])).rows[0].ok,false);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(reserve(), /permission denied/);
    await assert.rejects(db.query('SELECT reconcile_ai_requests($1)',[uid]), /permission denied/);
    await assert.rejects(db.query('SELECT complete_ai_request($1)',[completed]), /permission denied/);
  } finally { await db.close(); }
});


test('AI route finalizes successful results and attempts refunds for provider failures', async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-only';
  const operations = [];
  let providerFails = false;
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { plan: 'free' } }) }) }) }),
    rpc: async (name) => {
      operations.push(name);
      return { data: name === 'reserve_ai_request_v2' ? 'reservation' : true, error: null };
    },
  };
  const { POST } = loadSource('src/app/api/ai/route.ts', {
    '@supabase/supabase-js': { createClient: () => admin },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@anthropic-ai/sdk': { default: class {
      messages = { create: async () => { if (providerFails) throw Error('provider unavailable'); return { content: [{ type: 'text', text: 'answer' }] }; } };
    } },
  });
  const request = { headers: new Headers({ authorization: 'Bearer test' }), json: async () => ({ action: 'summary', text: 'text' }) };
  try {
    assert.equal((await POST(request)).status,200);
    assert.deepEqual(operations,['reserve_ai_request_v2','complete_ai_request']);
    operations.length = 0; providerFails = true;
    assert.equal((await POST(request)).status,500);
    assert.deepEqual(operations,['reserve_ai_request_v2','refund_ai_request']);
  } finally {
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldKey;
  }
});
