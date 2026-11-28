// AUTHZ-01 / AUTHZ-05: a user calling Supabase directly cannot get around
// plan limits or room invitations. Runs against a fresh database built from
// supabase/migrations (baseline + later migrations), acting as real users.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const { migratedDb, makeUser, asUser, rejects } = require('./helpers/migrated-db.cjs');

const { PLAN_LIMITS, ROOM_DURATION_HOURS, effectivePlanLimits } = loadSource('src/lib/planLimits.ts');
const MB = 1024 * 1024;

let db;
test.before(async () => { db = await migratedDb(); });
test.after(async () => { await db?.close(); });

const newRoom = (tx, host, extra = {}) => tx.query(
  `INSERT INTO public.study_rooms (id, host_user_id, document_name, pdf_path, status, max_members, expires_at)
   VALUES (gen_random_uuid(), $1::uuid, 'Doc', $1::text || '/doc.pdf', 'active', $2, $3)
   RETURNING id, max_members, expires_at, created_at`,
  [host, extra.maxMembers ?? 5, extra.expiresAt ?? null]);

test('database limits match src/lib/planLimits.ts exactly', async () => {
  const { rows } = await db.query('SELECT * FROM public.plan_limits ORDER BY plan');
  const byPlan = Object.fromEntries(rows.map((r) => [r.plan, r]));
  const num = (v) => (v === Infinity ? null : v);
  const expected = { ...PLAN_LIMITS, vip: effectivePlanLimits('free', true) };
  assert.deepEqual(Object.keys(byPlan).sort(), Object.keys(expected).sort());
  for (const [plan, l] of Object.entries(expected)) {
    const r = byPlan[plan];
    assert.equal(r.documents, num(l.documents), `${plan}.documents`);
    assert.equal(r.storage_bytes === null ? null : Number(r.storage_bytes), num(l.storageBytes), `${plan}.storageBytes`);
    assert.equal(r.ai_requests_per_month, num(l.aiRequestsPerMonth), `${plan}.aiRequestsPerMonth`);
    assert.equal(r.ai_requests_per_day, num(l.aiRequestsPerDay), `${plan}.aiRequestsPerDay`);
    assert.equal(r.can_create_rooms, l.canCreateRooms, `${plan}.canCreateRooms`);
    assert.equal(r.max_room_members, l.maxRoomMembers, `${plan}.maxRoomMembers`);
  }
  assert.equal(ROOM_DURATION_HOURS, 6, 'enforce_room_plan_limits hard-codes 6 hours');
});

test('a free user cannot create a room by calling Supabase directly', async () => {
  const free = await makeUser(db, { plan: 'free' });
  const err = await rejects(asUser(db, free, (tx) => newRoom(tx, free)));
  assert.equal(err.code, 'PLM01');
});

test('room size and lifetime are capped by the host plan, on insert and update', async () => {
  const premium = await makeUser(db, { plan: 'premium' });
  const pro = await makeUser(db, { plan: 'pro' });
  await asUser(db, premium, async (tx) => {
    const far = new Date(Date.now() + 30 * 24 * 3600e3).toISOString();
    const { rows: [room] } = await newRoom(tx, premium, { maxMembers: 1000, expiresAt: far });
    assert.equal(room.max_members, 5);
    assert.ok(new Date(room.expires_at) - Date.now() <= ROOM_DURATION_HOURS * 3600e3 + 5000, 'expiry clamped to 6 hours');
    const { rows: [grown] } = await tx.query(
      `UPDATE public.study_rooms SET max_members = 500, expires_at = now() + interval '10 days' WHERE id = $1 RETURNING max_members, expires_at, created_at`, [room.id]);
    assert.equal(grown.max_members, 5);
    assert.ok(new Date(grown.expires_at) - new Date(grown.created_at) <= ROOM_DURATION_HOURS * 3600e3 + 1000);
    const steal = await rejects(tx.query(`UPDATE public.study_rooms SET host_user_id = $2 WHERE id = $1`, [room.id, pro]));
    assert.match(steal.message, /host cannot be changed|row-level security/);
  });
  await asUser(db, pro, async (tx) => {
    const { rows: [room] } = await newRoom(tx, pro, { maxMembers: 999 });
    assert.equal(room.max_members, 20);
  });
});

test('AUTHZ-05: nobody can add themselves to a room except through join_room_atomic', async () => {
  const host = await makeUser(db, { plan: 'pro' });
  const outsider = await makeUser(db, { plan: 'pro' });
  const roomId = await asUser(db, host, async (tx) => {
    const { rows: [room] } = await newRoom(tx, host);
    const { rows: [joined] } = await tx.query('SELECT public.join_room_atomic($1) r', [room.id]);
    assert.equal(joined.r, 'joined', 'the host still joins through the RPC');
    return room.id;
  });
  const err = await rejects(asUser(db, outsider, (tx) =>
    tx.query('INSERT INTO public.room_members (room_id, user_id) VALUES ($1, $2)', [roomId, outsider])));
  assert.match(err.message, /permission denied/);
  await asUser(db, outsider, async (tx) => {
    const { rows: [r] } = await tx.query('SELECT public.join_room_atomic($1) r', [roomId]);
    assert.equal(r.r, 'not_invited', 'the RPC still requires an invitation');
  });
  const { rows } = await db.query('SELECT user_id FROM public.room_members WHERE room_id = $1', [roomId]);
  assert.deepEqual(rows.map((r) => r.user_id), [host]);
});

test('free accounts hold at most 3 documents (existing guard_document_lifetime rule)', async () => {
  assert.equal(PLAN_LIMITS.free.documents, 3, 'guard_document_lifetime hard-codes 3');
  const free = await makeUser(db, { plan: 'free' });
  const insertDoc = (tx, owner, id) => tx.query(
    `INSERT INTO public.documents (id, user_id, name, type, generation) VALUES ($1, $2, $1, 'pdf', gen_random_uuid())`, [id, owner]);
  await asUser(db, free, async (tx) => { for (const id of ['d1', 'd2', 'd3']) await insertDoc(tx, free, `${free}-${id}`); });
  const err = await rejects(asUser(db, free, (tx) => insertDoc(tx, free, `${free}-d4`)));
  assert.equal(err.code, 'PDQ01');
  const premium = await makeUser(db, { plan: 'premium' });
  await asUser(db, premium, async (tx) => { for (let i = 0; i < 5; i++) await insertDoc(tx, premium, `${premium}-${i}`); });
});

test('voice notes and room PDFs share one storage quota per plan', async () => {
  const free = await makeUser(db, { plan: 'free' });
  const upload = (tx, owner, bucket, name, size) => tx.query(
    `INSERT INTO storage.objects (bucket_id, name, owner_id, metadata) VALUES ($1, $2, $3, $4)`,
    [bucket, name, owner, size === null ? null : JSON.stringify({ size })]);
  // Voice notes are uploaded through a recording operation (#41), as the app does.
  const docId = `${free}-voice-doc`;
  const generation = await asUser(db, free, async (tx) => (await tx.query(
    `INSERT INTO public.documents (id, user_id, name, type, generation) VALUES ($1, $2, 'Doc', 'pdf', gen_random_uuid()) RETURNING generation`,
    [docId, free])).rows[0].generation);
  const beginRecording = (tx, size) => tx.query(
    `SELECT public.begin_recording_operation(gen_random_uuid(), 'document', $1, $2, '1', 10, 'audio/webm', $3, 'Note', now(), $4) AS op`,
    [docId, generation, size, free]).then((r) => r.rows[0].op.object_path);

  // Policy check at upload time (direct API call as the user).
  await asUser(db, free, (tx) => upload(tx, free, 'pdfs', `${free}/a.pdf`, 20 * MB));
  let err = await rejects(asUser(db, free, (tx) => upload(tx, free, 'pdfs', `${free}/b.pdf`, 11 * MB)));
  assert.match(err.message, /row-level security|Storage limit/);
  err = await rejects(asUser(db, free, async (tx) => upload(tx, free, 'voice-notes', await beginRecording(tx, 11 * MB), null)));
  assert.match(err.message, /row-level security|Storage limit/, 'voice notes count against the same total, using the declared size');
  const premium = await makeUser(db, { plan: 'premium' });
  const premiumDoc = `${premium}-voice-doc`;
  await asUser(db, premium, async (tx) => {
    const g = (await tx.query(`INSERT INTO public.documents (id, user_id, name, type, generation) VALUES ($1, $2, 'Doc', 'pdf', gen_random_uuid()) RETURNING generation`, [premiumDoc, premium])).rows[0].generation;
    const path = (await tx.query(`SELECT public.begin_recording_operation(gen_random_uuid(), 'document', $1, $2, '1', 10, 'audio/webm', $3, 'Note', now(), $4) AS op`, [premiumDoc, g, 11 * MB, premium])).rows[0].op.object_path;
    await upload(tx, premium, 'voice-notes', path, null); // control: same 11 MB recording fits a Premium quota
  });
  err = await rejects(asUser(db, free, (tx) => upload(tx, free, 'pdfs', `${free}/c.pdf`, null)));
  assert.match(err.message, /row-level security|Storage limit/, 'missing size reserves a full file');
  await asUser(db, free, async (tx) => upload(tx, free, 'voice-notes', await beginRecording(tx, 9 * MB), 9 * MB));

  // Commit check: Storage writes the final row with an elevated role.
  err = await rejects(upload(db, free, 'pdfs', `${free}/late.pdf`, 2 * MB));
  assert.equal(err.code, 'PLM01');
  await upload(db, null, 'pdfs', 'admin/backup.pdf', 500 * MB); // trusted upload without an owner

  const { rows: [used] } = await asUser(db, free, (tx) => tx.query('SELECT public.get_my_storage_bytes() b'));
  assert.equal(Number(used.b), 29 * MB);

  // Control: the very same uploads succeed for a free user who still has room,
  // so the rejections above come from the quota and not from path rules.
  const fresh = await makeUser(db, { plan: 'free' });
  await asUser(db, fresh, (tx) => upload(tx, fresh, 'pdfs', `${fresh}/b.pdf`, 11 * MB));

  const vip = await makeUser(db, { plan: 'free', vip: true });
  await asUser(db, vip, (tx) => upload(tx, vip, 'pdfs', `${vip}/big.pdf`, 90 * MB));
  await upload(db, vip, 'pdfs', `${vip}/big2.pdf`, 90 * MB);
});

test('limit helpers are not callable by end users', async () => {
  const user = await makeUser(db);
  for (const fn of ['public.effective_plan_limits($1)', 'public.storage_upload_fits($1, \'pdfs\', \'x\', null)']) {
    const err = await rejects(asUser(db, user, (tx) => tx.query(`SELECT ${fn}`, [user])));
    assert.match(err.message, /permission denied/, fn);
  }
  const err = await rejects(asUser(db, user, (tx) => tx.query('SELECT * FROM public.plan_limits')));
  assert.match(err.message, /permission denied/);
});
