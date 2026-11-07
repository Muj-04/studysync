const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync('supabase/migrations/20261107191733_constrain_pdf_storage_sharing.sql','utf8');
const host='11111111-1111-4111-8111-111111111111', member='22222222-2222-4222-8222-222222222222', outsider='33333333-3333-4333-8333-333333333333';
const room='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const shared=`${host}/rooms/${room}/shared.pdf`, privatePath=`${host}/personal.pdf`;
async function setup(t, before='', applyMigration=true) {
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`
    CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE SCHEMA auth;CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES('${host}'),('${member}'),('${outsider}');
    CREATE TABLE public.documents(id text PRIMARY KEY,user_id uuid);INSERT INTO documents VALUES('retained','${host}');
    CREATE TABLE public.study_rooms(id uuid PRIMARY KEY,host_user_id uuid,pdf_path text,status text,expires_at timestamptz);
    CREATE TABLE public.room_members(room_id uuid,user_id uuid,PRIMARY KEY(room_id,user_id));
    INSERT INTO study_rooms VALUES('${room}','${host}','${shared}','active',now()+interval '1 day');
    INSERT INTO room_members VALUES('${room}','${member}');
    CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);INSERT INTO storage.buckets VALUES('pdfs',false);
    CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb DEFAULT '{}',PRIMARY KEY(bucket_id,name));
    INSERT INTO storage.objects(bucket_id,name) VALUES('pdfs','${shared}'),('pdfs','${privatePath}'),('avatars','public.png');
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY pdfs_rooms_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='pdfs');
    CREATE POLICY legacy_pdf_owner ON storage.objects FOR ALL TO PUBLIC USING(bucket_id='pdfs' AND split_part(name,'/',1)=auth.uid()::text) WITH CHECK(bucket_id='pdfs' AND split_part(name,'/',1)=auth.uid()::text);
    CREATE POLICY fixture_avatars ON storage.objects FOR ALL TO PUBLIC USING(bucket_id='avatars') WITH CHECK(bucket_id='avatars');
    -- Keep an independent restrictive quota check: the migration must not remove it.
    CREATE POLICY launch_upload_limit ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(coalesce((metadata->>'quota_ok')::boolean,true));
    GRANT USAGE ON SCHEMA auth,storage,public TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
    GRANT ALL ON documents TO PUBLIC,anon,authenticated,service_role;
  `);
  if(before)await db.exec(before);
  if(applyMigration)await db.exec(migration);return db;
}
async function as(db,uid,role='authenticated'){await db.exec(`RESET ROLE; SET ROLE ${role}; SET test.uid='${uid||''}'`);}
async function names(db){return (await db.query("SELECT name FROM storage.objects WHERE bucket_id='pdfs' ORDER BY name")).rows.map(r=>r.name);}

test('PDF reads preserve owner and active-room sharing but deny outsiders and anonymous users',async t=>{
 const db=await setup(t);
 await as(db,outsider);assert.deepEqual(await names(db),[]);
 await as(db,null,'anon');assert.deepEqual(await names(db),[]);
 await as(db,host);assert.deepEqual((await names(db)).sort(),[privatePath,shared].sort());
 await as(db,member);assert.deepEqual(await names(db),[shared]);
 assert.equal((await db.query("SELECT count(*)::int n FROM storage.objects WHERE bucket_id='avatars'")).rows[0].n,1);
});

test('membership removal, room expiry and closure stop new PDF access',async t=>{
 const db=await setup(t);await as(db,member);assert.deepEqual(await names(db),[shared]);
 for(const change of ["DELETE FROM room_members", "UPDATE study_rooms SET status='closed'", "UPDATE study_rooms SET expires_at=now()-interval '1 second'"]){
  await db.exec('RESET ROLE');await db.exec(change);await as(db,member);assert.deepEqual(await names(db),[]);
  await db.exec(`RESET ROLE;INSERT INTO room_members VALUES('${room}','${member}') ON CONFLICT DO NOTHING;UPDATE study_rooms SET status='active',expires_at=now()+interval '1 day'`);
 }
});

test('a forged room PDF pointer cannot share a different owner or room namespace',async t=>{
 const db=await setup(t);
 await db.exec(`INSERT INTO study_rooms VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${outsider}','${privatePath}','active',now()+interval '1 day');INSERT INTO room_members VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${outsider}')`);
 await as(db,outsider);assert.deepEqual(await names(db),[]);
 await db.exec(`RESET ROLE;UPDATE study_rooms SET pdf_path='${privatePath}' WHERE id='${room}'`);
 await as(db,member);assert.deepEqual(await names(db),[]);
});

test('room members cannot modify hosts PDFs even with an extra permissive policy',async t=>{
 const db=await setup(t,'CREATE POLICY unexpected_broad ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true)');
 await as(db,member);
 await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('pdfs',$1)",[`${host}/injected.pdf`]),/policy/i);
 assert.equal((await db.query("UPDATE storage.objects SET metadata='{}' WHERE name=$1 RETURNING name",[shared])).rows.length,0);
 assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name',[shared])).rows.length,0);
 // Creation uploads before a study_rooms row exists; owner upsert must still work.
 const own=`${member}/rooms/cccccccc-cccc-4ccc-8ccc-cccccccccccc/new.pdf`;
 await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('pdfs',$1) ON CONFLICT(bucket_id,name) DO UPDATE SET metadata='{}'",[own]);
 await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('pdfs',$1) ON CONFLICT(bucket_id,name) DO UPDATE SET metadata='{}'",[own]);
 await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('pdfs',$1,'{\"quota_ok\":false}')",[`${member}/quota.pdf`]),/policy/i);
 assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name',[own])).rows.length,1);
});

test('document truncation is denied to API roles without losing documents',async t=>{
 const db=await setup(t);
 for(const role of ['anon','authenticated','service_role']) {await as(db,host,role);await assert.rejects(db.exec('TRUNCATE public.documents'),/permission denied/i);}
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int n FROM documents')).rows[0].n,1);
});

test('a public PDF bucket blocks migration rather than claiming RLS protects public URLs',async t=>{
 await assert.rejects(setup(t,"UPDATE storage.buckets SET public=true"),/private.*pdfs|pdfs.*private/i);
});


test('membership in one room cannot read another room PDF and deleted identities lose access',async t=>{
 const db=await setup(t);const secondRoom='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const secondPath=`${host}/rooms/${secondRoom}/second.pdf`;
 await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('pdfs',$1)",[secondPath]);
 await db.query("INSERT INTO study_rooms VALUES($1,$2,$3,'active',now()+interval '1 day')",[secondRoom,host,secondPath]);
 await db.query('UPDATE study_rooms SET pdf_path=$1 WHERE id=$2',[secondPath,room]);
 await as(db,member);assert.deepEqual(await names(db),[]);
 await db.exec('RESET ROLE');await db.query('DELETE FROM auth.users WHERE id=$1',[host]);
 await as(db,host);assert.deepEqual(await names(db),[]);
});

test('a late migration failure rolls back removed policies and newly created helpers',async t=>{
 const db=await setup(t,'',false);
 await db.exec('CREATE POLICY pdf_delete_owner_bound ON storage.objects FOR DELETE TO authenticated USING(true)');
 await assert.rejects(db.exec(migration), /already exists/);
 await db.exec('ROLLBACK');
 assert.equal((await db.query("SELECT to_regprocedure('public.can_read_pdf_object(text)') AS fn")).rows[0].fn,null);
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND policyname='pdfs_rooms_select'")).rows[0].n,1);
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND policyname='pdf_read_scope_bound'")).rows[0].n,0);
});
