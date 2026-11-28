// REL-02: the database must be rebuildable from the repo.
// Replays the baseline migration on a fresh Postgres (PGlite + a shim for the
// objects Supabase provides), then regenerates the schema snapshot from the
// rebuilt database and checks it matches the baseline it came from.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const { uuid_ossp } = require('@electric-sql/pglite/contrib/uuid_ossp');
const { buildBaseline } = require('../scripts/db/build-baseline.cjs');

const BASELINE = 'supabase/migrations/20261128000000_baseline_schema.sql';
const shim = fs.readFileSync('tests/fixtures/supabase-platform-shim.sql', 'utf8');
const baseline = fs.readFileSync(BASELINE, 'utf8');
const snapshotSql = fs.readFileSync('scripts/db/schema-snapshot.sql', 'utf8');

const statements = (ddl) => ddl.split(/\n{2,}/).map((s) => s.replace(/[ \t]+$/gm, '').trim()).filter(Boolean);

let db;
test.before(async () => {
  db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(shim);
  await db.exec(baseline);
});
test.after(async () => { await db?.close(); });

test('supabase/migrations starts from the baseline', () => {
  const files = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  assert.equal(files[0], '20261128000000_baseline_schema.sql');
});

test('baseline replays on a fresh database and round-trips through the snapshot', async () => {
  const { rows } = await db.query(snapshotSql);
  const rebuilt = statements(rows[0].ddl);
  const body = statements(baseline.replace(/^(--.*\n)+\n/, ''));
  // Differences that are expected on a plain test Postgres:
  // pg_cron/pg_net are wrapped in tolerant DO blocks, and the recording-worker
  // cron job is scheduled per project by hand.
  const expectedOnly = (s) => /CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net)/.test(s) || /recording-worker/.test(s);
  const missing = body.filter((s) => !expectedOnly(s) && !rebuilt.includes(s));
  const extra = rebuilt.filter((s) => !expectedOnly(s) && !body.includes(s));
  assert.deepEqual(missing, [], 'statements in the baseline that the rebuilt database lacks');
  assert.deepEqual(extra, [], 'statements in the rebuilt database that the baseline lacks');
});

test('security-critical rules survive the rebuild', async () => {
  const one = async (sql) => (await db.query(sql)).rows[0];
  assert.equal((await one(`select count(*)::int n from pg_tables where schemaname = 'public' and not rowsecurity`)).n, 0,
    'every public table has RLS enabled');
  const friend = await one(`select with_check from pg_policies where tablename = 'friendships' and policyname = 'friendships_insert'`);
  assert.match(friend.with_check, /status = 'pending'/);
  const posts = await one(`select qual from pg_policies where tablename = 'community_posts' and cmd = 'SELECT'`);
  assert.match(posts.qual, /can_view_community_author/);
  const plan = await one(`select has_column_privilege('authenticated', 'public.profiles', 'plan', 'SELECT') v`);
  assert.equal(plan.v, false, 'other users cannot read plan');
  const anonProfiles = await one(`select has_table_privilege('anon', 'public.profiles', 'SELECT') v`);
  assert.equal(anonProfiles.v, false, 'anon cannot read profiles');
});

test('build-baseline refuses empty snapshots and secrets', () => {
  assert.throws(() => buildBaseline('SELECT 1;'), /empty/);
  assert.throws(() => buildBaseline('CREATE TABLE x(); -- sk_live_abc123'), /Stripe key/);
});
