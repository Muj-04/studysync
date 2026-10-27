const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('referral expiry removes only expired reward access and preserves paid/VIP/Pro plans', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE profiles(id integer PRIMARY KEY,plan text,is_vip boolean,referral_expires_at timestamptz);
      CREATE TABLE subscriptions(user_id integer,plan text,status text);
      INSERT INTO profiles VALUES
        (1,'premium',false,now()-interval '1 day'),
        (2,'premium',false,now()-interval '1 day'),
        (3,'pro',false,now()-interval '1 day'),
        (4,'premium',true,now()-interval '1 day'),
        (5,'premium',false,now()+interval '1 day'),
        (6,'premium',false,NULL),
        (7,'premium',false,now()-interval '1 day'),
        (8,'premium',false,now()-interval '1 day'),
        (9,'premium',false,now()-interval '1 day');
      INSERT INTO subscriptions VALUES (2,'premium','active'),(7,'premium','past_due'),
        (8,'premium','trialing'),(9,'free','canceled');`);
    await db.exec(fs.readFileSync('supabase/migrations/20261007110000_expire_referral_rewards.sql','utf8'));
    assert.equal((await db.query('SELECT expire_referral_rewards() n')).rows[0].n,7);
    const rows=(await db.query('SELECT * FROM profiles ORDER BY id')).rows;
    assert.deepEqual(rows.map(r=>r.plan),['free','premium','pro','premium','premium','premium','premium','premium','free']);
    assert.ok(rows[4].referral_expires_at);
    assert.equal(rows[0].referral_expires_at,null);
    assert.equal((await db.query('SELECT expire_referral_rewards() n')).rows[0].n,0);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT expire_referral_rewards()'),/permission denied/);
  } finally { await db.close(); }
});
