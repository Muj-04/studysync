// Fresh Postgres (PGlite) with the Supabase shim and every migration in
// supabase/migrations applied in order: a production-equivalent database.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const { uuid_ossp } = require('@electric-sql/pglite/contrib/uuid_ossp');

const ROOT = path.join(__dirname, '..', '..');

async function migratedDb() {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(fs.readFileSync(path.join(ROOT, 'tests/fixtures/supabase-platform-shim.sql'), 'utf8'));
  const dir = path.join(ROOT, 'supabase/migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  await db.exec(`INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES
    ('pdfs', 'pdfs', false, 104857600), ('voice-notes', 'voice-notes', false, 52428800)
    ON CONFLICT (id) DO NOTHING;`);
  return db;
}

/** Create an auth user + profile with the given plan. Returns the user id. */
async function makeUser(db, { plan = 'free', vip = false } = {}) {
  const { rows } = await db.query('SELECT gen_random_uuid() AS id');
  const id = rows[0].id;
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [id, `${id}@test.local`]);
  // handle_new_user created the profile; plan/vip are locked for end users, so set them as owner.
  await db.query('UPDATE public.profiles SET plan = $2, is_vip = $3 WHERE id = $1', [id, plan, vip]);
  return id;
}

/** Run fn as a signed-in user (role authenticated + JWT claims) inside a rolled-back-safe block. */
async function asUser(db, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    await tx.query('SET LOCAL ROLE authenticated');
    return fn(tx);
  });
}

/** Expect a promise to fail; returns the error. */
async function rejects(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('Expected the statement to be rejected');
}

module.exports = { migratedDb, makeUser, asUser, rejects };
