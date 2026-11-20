const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { loadSource } = require('./load-source.cjs');

test('billing cancellation preserves an unexpired referral reward until its expiry', async () => {
  const db = new PGlite();
  const uid = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE profiles(id uuid PRIMARY KEY,plan text,is_vip boolean,referral_expires_at timestamptz);
      INSERT INTO profiles VALUES('${uid}','premium',false,now()+interval '7 days');
      CREATE TABLE subscriptions(user_id uuid PRIMARY KEY,plan text,status text,stripe_customer_id text,stripe_subscription_id text,updated_at timestamptz);`);
    await db.exec(fs.readFileSync('supabase/migrations/20261004100000_billing_event_transactions.sql', 'utf8'));
    const correction = 'supabase/migrations/20261026100000_preserve_referral_billing_entitlements.sql';
    await db.exec(fs.readFileSync(correction, 'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261007110000_expire_referral_rewards.sql', 'utf8'));
    const apply = (id, created, status) => db.query('SELECT apply_billing_event($1,$2,$3,$4,$5,$6,$7)', [id, created, uid, 'premium', 'cus', 'sub', status]);
    await apply('active', 1, 'active');
    for (const [index, status] of ['unpaid', 'paused', 'canceled'].entries()) {
      await apply(status, index + 2, status);
      assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'premium', status);
      assert.equal((await db.query('SELECT plan FROM subscriptions')).rows[0].plan, 'free', status);
    }
    await db.exec("UPDATE profiles SET referral_expires_at=now()-interval '1 second'");
    await db.query('SELECT expire_referral_rewards()');
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'free');
  } finally { await db.close(); }
});

test('webhook errors propagate instead of acknowledging failed entitlement writes', async () => {
  const { applyBillingEvent } = loadSource('src/lib/billing/webhook.ts');
  const event = { id: 'evt', created: 1, type: 'checkout.session.completed', data: { object: {
    mode: 'subscription', payment_status: 'paid', metadata: { userId: 'user', plan: 'premium' }, customer: 'cus', subscription: 'sub',
  } } };
  await assert.rejects(applyBillingEvent({ rpc: async () => ({ error: { message: 'database down' } }) }, event), /database down/);

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
    CREATE TABLE profiles(id uuid PRIMARY KEY,plan text,referral_expires_at timestamptz);
    INSERT INTO profiles(id,plan) VALUES('${uid}','free');
    CREATE TABLE subscriptions(user_id uuid PRIMARY KEY,plan text,status text CONSTRAINT subscriptions_status_check CHECK(status IN ('active','canceled','past_due','trialing')),stripe_customer_id text,stripe_subscription_id text,updated_at timestamptz);
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261004100000_billing_event_transactions.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004101000_checkout_attempts.sql', 'utf8'));
  const apply = (id, created, status, plan = 'premium', user = uid) => db.query('SELECT apply_billing_event($1,$2,$3,$4,$5,$6,$7)', [id, created, user, plan, 'cus', 'sub', status]);
  try {
    await assert.rejects(apply('before-migration', 1, 'unpaid'), /subscriptions_status_check/);
    await db.exec(fs.readFileSync('supabase/migrations/20261007100000_subscription_status_compatibility.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261026100000_preserve_referral_billing_entitlements.sql', 'utf8'));
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
    await apply('paused', 13, 'paused', null, null);
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'free');
    await apply('resumed', 14, 'active', null, null);
    assert.equal((await db.query('SELECT plan FROM profiles')).rows[0].plan, 'premium');
    await apply('cancel', 15, 'canceled', null, null);
    await apply('late', 15, 'active', null, null);
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

test('reconciliation serializes provider reads, fences expired workers and applies current state despite timestamp ties', async () => {
  const db = new PGlite();
  const uid = '11111111-1111-4111-8111-111111111111';
  const { applyBillingEvent } = loadSource('src/lib/billing/webhook.ts');
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE profiles(id uuid PRIMARY KEY,plan text,referral_expires_at timestamptz);
      INSERT INTO profiles VALUES('${uid}','free',null);
      CREATE TABLE subscriptions(user_id uuid PRIMARY KEY,plan text,status text,stripe_customer_id text,stripe_subscription_id text,updated_at timestamptz);`);
    for (const file of ['20261004100000_billing_event_transactions.sql', '20261026100000_preserve_referral_billing_entitlements.sql', '20261027140326_serialize_billing_reconciliation.sql']) {
      await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const rpc = async (name, args) => {
      const values = Object.values(args);
      try {
        const result = await db.query(`SELECT ${name}(${Object.keys(args).map((key, i) => `${key} => $${i + 1}`).join(',')}) AS data`, values);
        return { data: result.rows[0].data };
      } catch (error) { return { error }; }
    };
    const admin = { rpc, from: () => ({ select: () => ({ eq: (column, value) => ({ maybeSingle: async () => {
      const result = await db.query('SELECT stripe_subscription_id FROM subscriptions WHERE user_id=$1', [value]);
      return { data: result.rows[0] ?? null };
    } }) }) }) };
    let current = { id: 'sub', customer: 'cus', created: 1, status: 'active', metadata: { userId: uid, plan: 'premium' } };
    let reads = 0;
    const stripe = { subscriptions: { retrieve: async () => { reads++; return { ...current }; } } };
    const event = (id, created = 10, type = 'customer.subscription.updated') => ({ id, created, type, data: { object: { id: 'sub', status: 'active' } } });
    const plan = async () => (await db.query('SELECT plan FROM subscriptions')).rows[0].plan;
    await applyBillingEvent(admin, event('initial'), stripe);
    current.status = 'paused';
    await applyBillingEvent(admin, event('paused'), stripe);
    await applyBillingEvent(admin, event('stale-active'), stripe);
    assert.equal(await plan(), 'free');
    current.status = 'active';
    await applyBillingEvent(admin, event('recovery', 9), stripe);
    assert.equal(await plan(), 'premium', 'older event still reads current recovery');
    const before = reads;
    await applyBillingEvent(admin, event('recovery', 9), stripe);
    assert.equal(reads, before, 'committed duplicate skips provider');

    // Worker A read active, then stalls beyond its lease; worker B sees paused.
    const first = await rpc('claim_billing_reconciliation', { p_subscription_id: 'sub', p_event_id: 'slow' });
    await assert.rejects(applyBillingEvent(admin, event('contended'), stripe), /busy/);
    assert.equal(reads, before, 'contended worker does not fetch before acquiring lease');
    await db.exec("UPDATE billing_reconciliation_leases SET expires_at=now()-interval '1 second'");
    current.status = 'paused';
    await applyBillingEvent(admin, event('new-worker'), stripe);
    const staleCommit = await rpc('commit_billing_reconciliation', {
      p_event_id: 'slow', p_created: 10, p_user_id: uid, p_plan: 'premium', p_customer_id: 'cus', p_subscription_id: 'sub',
      p_status: 'active', p_token: first.data.token, p_subscription_created: 1,
    });
    assert.match(staleCommit.error.message, /lease lost/);
    assert.equal(await plan(), 'free');
    assert.equal((await db.query("SELECT count(*)::int n FROM billing_events WHERE event_id='slow'")).rows[0].n, 0);
    await assert.rejects(applyBillingEvent(admin, event('missing'), { subscriptions: { retrieve: async () => { throw Error('resource_missing'); } } }), /resource_missing/);
    assert.equal((await db.query("SELECT count(*)::int n FROM billing_events WHERE event_id='missing'")).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM billing_reconciliation_leases')).rows[0].n, 0);
    // A failed entitlement write must roll back its receipt and permit redelivery.
    await db.exec(`CREATE FUNCTION reject_billing_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected write failure'; END; $$;
      CREATE TRIGGER reject_billing BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION reject_billing_write();`);
    current.status = 'active';
    await assert.rejects(applyBillingEvent(admin, event('db-retry'), stripe), /injected write failure/);
    assert.equal((await db.query("SELECT count(*)::int n FROM billing_events WHERE event_id='db-retry'")).rows[0].n, 0);
    assert.equal(await plan(), 'free');
    await db.exec('DROP TRIGGER reject_billing ON profiles');
    await applyBillingEvent(admin, event('db-retry'), stripe);
    assert.equal(await plan(), 'premium');
    current.status = 'canceled';
    await applyBillingEvent(admin, event('deleted', 10, 'customer.subscription.deleted'), stripe);
    assert.equal(await plan(), 'free');
    // Pre-migration canceled subscribers have no creation time and may never
    // receive another old-subscription event. Replacement repairs them itself.
    await db.exec('UPDATE subscriptions SET stripe_subscription_created=NULL');
    const legacy = { ...current, metadata: {} };
    const replacementReads = [];
    stripe.subscriptions.retrieve = async (id) => {
      replacementReads.push(id);
      if (id === 'sub') {
        assert.equal((await db.query("SELECT count(*)::int n FROM billing_reconciliation_leases WHERE subscription_id='sub-new'")).rows[0].n, 0,
          'replacement lease released before acquiring legacy lease');
        return legacy;
      }
      return { ...current };
    };
    // A newly created replacement wins over a delayed canceled event for the old one.
    current = { ...current, id: 'sub-new', created: 2, status: 'active' };
    const replacement = event('replacement');
    replacement.data.object.id = 'sub-new';
    await applyBillingEvent(admin, replacement, stripe);
    assert.deepEqual(replacementReads, ['sub-new', 'sub', 'sub-new'], 'replacement reread after legacy reconciliation');
    assert.equal((await db.query('SELECT stripe_subscription_created FROM subscriptions')).rows[0].stripe_subscription_created, 2);
    stripe.subscriptions.retrieve = async () => ({ ...current });
    current = { ...current, id: 'sub', created: 1, status: 'canceled' };
    await applyBillingEvent(admin, event('late-old', 99), stripe);
    assert.equal((await db.query('SELECT stripe_subscription_id FROM subscriptions')).rows[0].stripe_subscription_id, 'sub-new');
    assert.equal(await plan(), 'premium');
    await db.exec('SET ROLE service_role');
    await assert.rejects(db.query("SELECT apply_billing_event('bypass',99,$1,'premium','cus','sub','active')", [uid]), /permission denied/);
    await db.exec('SET ROLE authenticated');
    assert.match((await rpc('claim_billing_reconciliation', { p_subscription_id: 'sub', p_event_id: 'attack' })).error.message, /permission denied/);
  } finally { await db.close(); }
});

test('checkout reconciles subscription metadata and status instead of assuming payment means active', async () => {
  const { applyBillingEvent } = loadSource('src/lib/billing/webhook.ts');
  let committed;
  const admin = { rpc: async (name, args) => {
    if (name === 'claim_billing_reconciliation') return { data: { token: 'lease' } };
    if (name === 'commit_billing_reconciliation') committed = args;
    return {};
  } };
  const event = { id: 'checkout', created: 9, type: 'checkout.session.completed', data: { object: {
    mode: 'subscription', payment_status: 'paid', customer: 'cus', subscription: 'sub', metadata: { userId: 'user', plan: 'premium' },
  } } };
  let sub = { id: 'sub', customer: 'cus', status: 'paused', created: 1, metadata: { userId: 'user', plan: 'pro' } };
  const stripe = { subscriptions: { retrieve: async () => sub } };
  await applyBillingEvent(admin, event, stripe);
  assert.equal(committed.p_status, 'paused');
  assert.equal(committed.p_plan, 'pro');
  sub = { ...sub, metadata: {} };
  await applyBillingEvent(admin, event, stripe);
  assert.equal(committed.p_plan, 'premium', 'legacy checkout metadata registers subscription');
  assert.equal(committed.p_user_id, 'user');
  sub.metadata = { userId: 'another-user' };
  await assert.rejects(applyBillingEvent(admin, event, stripe), /owner mismatch/);
});
