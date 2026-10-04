const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { loadSource } = require('./load-source.cjs');

test('webhook errors propagate instead of acknowledging failed entitlement writes', async () => {
  const { applyBillingEvent } = loadSource('src/lib/billing/webhook.ts');
  const event = { id: 'evt', created: 1, type: 'checkout.session.completed', data: { object: {
    mode: 'subscription', payment_status: 'paid', metadata: { userId: 'user', plan: 'premium' }, customer: 'cus', subscription: 'sub',
  } } };
  await assert.rejects(applyBillingEvent({ rpc: async () => ({ error: { message: 'database down' } }) }, event), /database down/);
  let calls = 0;
  event.data.object.payment_status = 'unpaid';
  await applyBillingEvent({ rpc: async () => { calls++; } }, event);
  assert.equal(calls, 0);
});

test('existing subscribers go to the portal without reserving another checkout', async () => {
  const { prepareCheckout } = loadSource('src/lib/billing/checkout.ts');
  const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_subscription_id: 'sub' } }) }) }) }), rpc: () => { throw Error('Must not open checkout'); } };
  const stripe = { subscriptions: { retrieve: async () => ({ status: 'active', customer: 'customer' }) }, billingPortal: { sessions: { create: async () => ({ url: 'portal-url' }) } } };
  assert.deepEqual(await prepareCheckout(admin, stripe, { id: 'user', email: 'email' }, 'pro', 'monthly', 'https://app.test'), { url: 'portal-url' });
});

test('billing SQL rolls back, deduplicates, orders events, and restricts RPC access', async () => {
  const db = new PGlite();
  const uid = '11111111-1111-4111-8111-111111111111';
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${uid}');
    CREATE TABLE profiles(id uuid PRIMARY KEY,plan text);
    INSERT INTO profiles VALUES('${uid}','free');
    CREATE TABLE subscriptions(user_id uuid PRIMARY KEY,plan text,status text CHECK(status <> 'fail'),stripe_customer_id text,stripe_subscription_id text,updated_at timestamptz);
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261004100000_billing_event_transactions.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004101000_checkout_attempts.sql', 'utf8'));
  const apply = (id, created, status, plan = 'premium', user = uid) => db.query('SELECT apply_billing_event($1,$2,$3,$4,$5,$6,$7)', [id, created, user, plan, 'cus', 'sub', status]);
  try {
    await assert.rejects(apply('fail', 1, 'fail'));
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'free');
    assert.equal((await db.query('SELECT count(*)::int n FROM billing_events')).rows[0].n, 0);
    await apply('first', 10, 'active');
    await apply('first', 10, 'active');
    assert.equal((await db.query('SELECT count(*)::int n FROM billing_events')).rows[0].n, 1);
    await apply('old', 5, 'canceled', null, null);
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'premium');
    await apply('unpaid', 11, 'unpaid', null, null);
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'free');
    await apply('recovered', 12, 'active', null, null);
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'premium');
    await apply('cancel', 13, 'canceled', null, null);
    await apply('late', 13, 'active', null, null);
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'free');
    const reserve = () => db.query('SELECT * FROM reserve_checkout_attempt($1,$2,$3,$4,$5)', [uid, 'premium','monthly','email','https://app.test']);
    const one = (await reserve()).rows[0];
    const two = (await reserve()).rows[0];
    assert.equal(one.attempt_id, two.attempt_id);
    await assert.rejects(db.query('SELECT * FROM reserve_checkout_attempt($1,$2,$3,$4,$5)', [uid,'pro','monthly','email','https://app.test']), /still open/);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(apply('attack', 100, 'active'), /permission denied/);
  } finally { await db.close(); }
});
