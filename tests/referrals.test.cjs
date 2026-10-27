const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('referral redemption rewards once, preserves Pro, and rolls back failed rewards', async () => {
  const db=new PGlite();
  const host='11111111-1111-4111-8111-111111111111', guest='22222222-2222-4222-8222-222222222222', failed='33333333-3333-4333-8333-333333333333';
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz);
    INSERT INTO auth.users VALUES('${host}',now()),('${guest}',now()),('${failed}',now());
    CREATE TABLE profiles(id uuid PRIMARY KEY,created_at timestamptz,referral_code text UNIQUE,referral_expires_at timestamptz,is_vip boolean,plan text);
    INSERT INTO profiles VALUES('${host}',now()-interval '2 days','CODE',null,false,'pro'),('${guest}',now(),'GUEST',null,false,'free'),('${failed}',now(),'FAILED',null,false,'free');
    CREATE TABLE referrals(id uuid DEFAULT gen_random_uuid(),referrer_id uuid,referred_id uuid,reward_granted boolean,ip_address text,created_at timestamptz DEFAULT now());`);
  await db.exec(fs.readFileSync('supabase/migrations/20261004130000_atomic_referral_rewards.sql','utf8'));
  const redeem=async id=>(await db.query('SELECT redeem_referral($1,$2) result',[id,'code'])).rows[0].result;
  try {
    assert.equal(await redeem(guest),'ok');
    const expiry=(await db.query('SELECT referral_expires_at FROM profiles WHERE id=$1',[host])).rows[0].referral_expires_at;
    assert.equal(await redeem(guest),'already_referred');
    assert.equal((await db.query('SELECT referral_expires_at FROM profiles WHERE id=$1',[host])).rows[0].referral_expires_at.toISOString(),expiry.toISOString());
    assert.equal((await db.query('SELECT plan FROM profiles WHERE id=$1',[host])).rows[0].plan,'pro');
    assert.equal((await db.query('SELECT plan FROM profiles WHERE id=$1',[guest])).rows[0].plan,'premium');
    await db.exec(`ALTER TABLE profiles ADD CONSTRAINT test_failure CHECK(id <> '${failed}' OR plan='free');`);
    await assert.rejects(redeem(failed));
    assert.equal((await db.query('SELECT count(*)::int n FROM referrals')).rows[0].n,1);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(redeem(guest),/permission denied/);
  } finally {await db.close();}
});
