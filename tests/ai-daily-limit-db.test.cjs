// AI-01: daily and monthly AI caps are enforced atomically in the database,
// with limits read from public.plan_limits (not passed in by the caller).
const test = require('node:test');
const assert = require('node:assert/strict');
const { migratedDb, makeUser, asUser, rejects } = require('./helpers/migrated-db.cjs');

let db;
test.before(async () => { db = await migratedDb(); });
test.after(async () => { await db?.close(); });

const MONTH = new Date().toISOString().slice(0, 7);
const reserve = async (user) => (await db.query('SELECT public.reserve_ai_request_v3($1, $2) r', [user, MONTH])).rows[0].r;

test('free plan: 5 per day, then the daily cap answers', async () => {
  const user = await makeUser(db, { plan: 'free' });
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = await reserve(user);
    assert.ok(r.reservation, `request ${i + 1} reserved`);
    ids.push(r.reservation);
  }
  const sixth = await reserve(user);
  assert.equal(sixth.reservation, null);
  assert.equal(sixth.limit, 'daily');
  assert.equal(sixth.daily_limit, 5);
  // A refunded request (provider failure) gives the slot back.
  await db.query('SELECT public.refund_ai_request($1)', [ids[0]]);
  assert.ok((await reserve(user)).reservation);
  // Completed requests keep counting.
  await db.query('SELECT public.complete_ai_request($1)', [ids[1]]);
  assert.equal((await reserve(user)).limit, 'daily');
});

test('yesterday does not count toward today, but still counts toward the month', async () => {
  const user = await makeUser(db, { plan: 'free' });
  for (let i = 0; i < 5; i++) await reserve(user);
  await db.query(`UPDATE public.ai_request_reservations SET created_at = created_at - interval '1 day', status = 'completed' WHERE user_id = $1`, [user]);
  for (let i = 0; i < 5; i++) assert.ok((await reserve(user)).reservation, 'a new day has 5 fresh requests');
  await db.query(`UPDATE public.ai_request_reservations SET created_at = created_at - interval '2 days', status = 'completed' WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [user]);
  for (let i = 0; i < 5; i++) assert.ok((await reserve(user)).reservation);
  await db.query(`UPDATE public.ai_request_reservations SET created_at = created_at - interval '3 days', status = 'completed' WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [user]);
  const r = await reserve(user);
  assert.equal(r.limit, 'monthly', '15 this month is the monthly cap');
  assert.equal(r.monthly_limit, 15);
});

test('paid plans and VIP use their own caps', async () => {
  const premium = await makeUser(db, { plan: 'premium' });
  for (let i = 0; i < 40; i++) assert.ok((await reserve(premium)).reservation);
  assert.equal((await reserve(premium)).limit, 'daily');
  const vip = await makeUser(db, { plan: 'free', vip: true });
  for (let i = 0; i < 60; i++) assert.ok((await reserve(vip)).reservation);
});

test('concurrent requests cannot exceed the daily cap', async () => {
  const user = await makeUser(db, { plan: 'free' });
  const results = await Promise.all(Array.from({ length: 12 }, () => reserve(user)));
  assert.equal(results.filter((r) => r.reservation).length, 5);
});

test('only the service role can reserve', async () => {
  const user = await makeUser(db);
  const err = await rejects(asUser(db, user, (tx) => tx.query('SELECT public.reserve_ai_request_v3($1, $2)', [user, MONTH])));
  assert.match(err.message, /permission denied/);
});
