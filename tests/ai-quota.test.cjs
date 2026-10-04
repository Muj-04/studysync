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
