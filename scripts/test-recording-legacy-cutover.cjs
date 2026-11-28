#!/usr/bin/env node
// Local disposable PostgreSQL only. Rehearses the production recording cutover:
// populated TEXT-ID recording tables (the production shape on 2026-11-20) through
// #40 -> 20261028203000 -> #41 -> 20261120191000, and checks every legacy recording
// is adopted or quarantined without rewriting IDs, URLs or Storage objects.
const fs=require('node:fs');const {spawnSync}=require('node:child_process');const assert=require('node:assert/strict');
const socket=process.env.RECORDING_TEST_PG_SOCKET,bin=process.env.RECORDING_TEST_PSQL||'psql',database=process.env.RECORDING_TEST_PG_DATABASE;
if(!socket?.startsWith('/')||database!=='integrity_recordings'){throw Error('Set a local Unix socket and disposable database integrity_recordings.');}
const childEnv={...process.env};for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE'])delete childEnv[key];
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',socket,'-p',process.env.RECORDING_TEST_PG_PORT||'5432','-U',process.env.RECORDING_TEST_PG_USER||process.env.USER,'-d',database];
function sql(input){const r=spawnSync(bin,args,{input,encoding:'utf8',env:childEnv});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const file=f=>fs.readFileSync(f,'utf8');

// Same base as scripts/test-recording-postgres.cjs.
let base=file('tests/server-recording-fixture.sql');
base=base.replace(/CREATE ROLE (\w+);/g,(_,role)=>`DO $$BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);
base=base.replace(/CREATE TABLE public.document_lifetimes[\s\S]*?END\$\$;/,'');
base+='\n'+file('tests/fixtures/recording-deployed-policies.sql');
base+='\n'+file('tests/fixtures/document-generation-base.sql').split('\n').filter(l=>/^CREATE TABLE /.test(l)&&!/^CREATE TABLE (profiles|documents|voice_notes)\(/.test(l)).join('\n');
base+='\nCREATE TABLE profiles(id uuid PRIMARY KEY,plan text,is_vip boolean);GRANT SELECT,INSERT,UPDATE,DELETE ON documents TO authenticated;';
base+="\nALTER TABLE voice_notes ALTER COLUMN id TYPE text USING id::text;ALTER TABLE room_voice_notes ALTER COLUMN id TYPE text USING id::text;ALTER TABLE room_voice_notes ALTER COLUMN audio_url DROP NOT NULL;ALTER TABLE study_sessions ALTER COLUMN document_id SET NOT NULL;";

const U='11111111-1111-4111-8111-111111111111', ROOM='44444444-4444-4444-8444-444444444444';
const ok='aaaaaaaa-0000-4000-8000-000000000001', upper='BBBBBBBB-0000-4000-8000-000000000002', orphan='cccccccc-0000-4000-8000-000000000003';
const room='dddddddd-0000-4000-8000-000000000004', roomNoAudio='eeeeeeee-0000-4000-8000-000000000005', foreign='ffffffff-0000-4000-8000-000000000006';
const url=p=>`https://x.supabase.co/storage/v1/object/sign/voice-notes/${p}?token=t`;
// Populated legacy rows shaped like production.
const seed=`
INSERT INTO voice_notes(id,user_id,document_id,page_number,duration,title,audio_url,audio_size_bytes,timestamp) VALUES
 ('${ok}','${U}','doc','1',3,'ok','${url(`${U}/doc/${ok}.webm`)}',5,now()),
 ('${upper}','${U}','doc','2',3,'upper','${url(`${U}/doc/${upper}.webm`)}',5,now()),
 ('${orphan}','${U}','doc','3',3,'missing object','${url(`${U}/doc/${orphan}.webm`)}',5,now()),
 ('${foreign}','${U}','doc','4',3,'foreign path','${url(`22222222-2222-4222-8222-222222222222/doc/${foreign}.webm`)}',5,now());
INSERT INTO room_voice_notes(id,user_id,room_id,page_number,duration,title,audio_url,timestamp) VALUES
 ('${room}','${U}','${ROOM}','1',3,'room','${url(`rooms/${ROOM}/${room}.webm`)}',now()),
 ('${roomNoAudio}','${U}','${ROOM}','1',3,'failed upload',NULL,now());
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
 ('voice-notes','${U}/doc/${ok}.webm','{"size":5}'),
 ('voice-notes','${U}/doc/${upper}.webm','{"size":5}'),
 ('voice-notes','rooms/${ROOM}/${room}.webm','{"size":5}'),
 ('voice-notes','${U}/doc/untracked-orphan.webm','{"size":5}');`;

function reset(){sql('DROP SCHEMA IF EXISTS recording_private CASCADE;DROP SCHEMA public CASCADE;DROP SCHEMA IF EXISTS auth CASCADE;DROP SCHEMA IF EXISTS storage CASCADE;CREATE SCHEMA public;'+base);sql(seed);}
const m40=file('supabase/migrations_archive/20261028202847_document_generation_guards.sql');
const pre=file('supabase/migrations_archive/20261028203000_convert_populated_recording_ids.sql');
const m41=file('supabase/migrations_archive/20261028203014_server_recording_operations.sql');
const post=file('supabase/migrations_archive/20261120191000_adopt_case_mismatched_legacy_recordings.sql');
const counts=()=>sql("SELECT (SELECT count(*) FROM voice_notes)||'/'||(SELECT count(*) FROM room_voice_notes)||'/'||(SELECT count(*) FROM storage.objects);");

// 1. Without the pre-step, #41 refuses the populated TEXT tables and changes nothing.
reset(); sql(m40);
assert.throws(()=>sql(m41),/nonempty voice_notes\.id TEXT/);
assert.equal(sql("SELECT udt_name FROM information_schema.columns WHERE table_name='voice_notes' AND column_name='id';"),'text');
assert.equal(sql("SELECT to_regclass('recording_private.operations') IS NULL;"),'t','#41 rolled back completely');
console.log('legacy cutover: #41 alone aborts on populated TEXT IDs and rolls back.');

// 2. Pre-step guards: a non-UUID ID aborts without converting anything.
reset(); sql(m40);
sql("INSERT INTO room_voice_notes(id,user_id,room_id,page_number,duration,audio_url,timestamp) VALUES('not-a-uuid','"+U+"','"+ROOM+"','1',1,NULL,now());");
assert.throws(()=>sql(pre),/non-UUID/);
assert.equal(sql("SELECT udt_name FROM information_schema.columns WHERE table_name='voice_notes' AND column_name='id';"),'text');
// Cross-table collision aborts too.
sql("DELETE FROM room_voice_notes WHERE id='not-a-uuid';INSERT INTO room_voice_notes(id,user_id,room_id,page_number,duration,audio_url,timestamp) VALUES('"+ok.toUpperCase()+"','"+U+"','"+ROOM+"','1',1,NULL,now());");
assert.throws(()=>sql(pre),/both voice_notes and room_voice_notes/);
console.log('legacy cutover: pre-step refuses non-UUID IDs and cross-table collisions.');

// 3. Full production sequence.
reset(); const before=counts();
sql(m40); sql(pre); sql(m41);
const st=id=>sql(`SELECT state||'|'||coalesce(object_path,'') FROM recording_private.operations WHERE note_id='${id.toLowerCase()}';`);
assert.equal(st(ok),`published|${U}/doc/${ok}.webm`);
assert.equal(st(upper),'blocked|','uppercase legacy path is quarantined by #41 alone');
sql(post);
assert.equal(st(upper),`published|${U}/doc/${upper}.webm`,'case-insensitive adoption keeps the real stored name');
// #41 adopts a conventional path from the URL alone (object existence is not checked);
// production has an object for every personal row, verified 2026-11-20.
assert.equal(st(orphan),`published|${U}/doc/${orphan}.webm`);
assert.equal(st(foreign),'blocked|','another account\'s path is never adopted');
assert.equal(st(room),`published|rooms/${ROOM}/${room}.webm`);
assert.equal(st(roomNoAudio),'blocked|','failed room upload stays quarantined');
assert.equal(counts(),before,'no recording rows or Storage objects were added or removed');
assert.equal(sql(`SELECT audio_url FROM voice_notes WHERE id='${upper.toLowerCase()}';`),url(`${U}/doc/${upper}.webm`),'stored URLs are unchanged');
assert.equal(sql("SELECT count(*) FROM voice_notes WHERE recording_operation_id IS NULL;"),'0');
// Idempotent: a second run adopts nothing new and changes nothing.
sql(post); assert.equal(st(upper),`published|${U}/doc/${upper}.webm`);
// On already-UUID tables (staging) the pre-step is a no-op.
sql(pre);
console.log('legacy cutover: production sequence adopts conventional paths (incl. uppercase via post-step), quarantines foreign-path and failed-upload rows, preserves all rows, URLs and objects.');
