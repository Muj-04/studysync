#!/usr/bin/env node
// Explicit local disposable database only. Requires schema migration prerequisite.
const fs=require('node:fs');const {spawn,spawnSync}=require('node:child_process');const assert=require('node:assert/strict');
const socket=process.env.RECORDING_TEST_PG_SOCKET,bin=process.env.RECORDING_TEST_PSQL||'psql',database=process.env.RECORDING_TEST_PG_DATABASE;
if(!socket?.startsWith('/')||database!=='integrity_recordings'){throw Error('Set a local Unix socket and disposable database integrity_recordings.');}
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',socket,'-p',process.env.RECORDING_TEST_PG_PORT||'5432','-U',process.env.RECORDING_TEST_PG_USER||process.env.USER,'-d',database];
function sql(input){const r=spawnSync(bin,args,{input,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const schemaPath=process.env.RECORDING_TEST_GENERATION_MIGRATION||'supabase/migrations/20261028202847_document_generation_guards.sql';
let base=fs.readFileSync('tests/server-recording-fixture.sql','utf8');
base=base.replace(/CREATE ROLE (\w+);/g,(_,role)=>`DO $$BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END$$;`);
base=base.replace(/CREATE TABLE public.document_lifetimes[\s\S]*?END\$\$;/,'');
base+='\n'+fs.readFileSync('tests/fixtures/document-generation-base.sql','utf8').split('\n').filter(line=>/^CREATE TABLE /.test(line)&&!/^CREATE TABLE (profiles|documents|voice_notes)\(/.test(line)).join('\n');
base+='\nCREATE TABLE profiles(id uuid PRIMARY KEY,plan text,is_vip boolean);GRANT SELECT,INSERT,UPDATE,DELETE ON documents TO authenticated;';
sql('DROP SCHEMA IF EXISTS recording_private CASCADE;DROP SCHEMA public CASCADE;DROP SCHEMA IF EXISTS auth CASCADE;DROP SCHEMA IF EXISTS storage CASCADE;CREATE SCHEMA public;'+base);
sql(fs.readFileSync(schemaPath,'utf8'));sql(fs.readFileSync('supabase/migrations/20261028203014_server_recording_operations.sql','utf8'));
const owner='11111111-1111-4111-8111-111111111111';
const auth=`SET request.storage.operation='object.upload';SET request.jwt.claim.sub='${owner}';SET request.jwt.claim.role='authenticated';SET ROLE authenticated;`;
const service=`SET request.jwt.claim.role='service_role';SET ROLE service_role;`;
const note='55555555-5555-4555-8555-555555555555';
const op=JSON.parse(sql(auth+`SELECT begin_recording_operation('${note}','document','doc','33333333-3333-4333-8333-333333333333','1',2,'audio/webm',5,'Lecture',now(),'${owner}');`));
sql(auth+`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes','${op.object_path}','{"size":5,"mimetype":"audio/webm"}');`);
// A worker outage cannot expire bytes that already reached Storage.
sql(`UPDATE recording_private.operations SET upload_deadline=now()-interval '1 day' WHERE id='${op.id}';`);
function held(input){const child=spawn(bin,args,{stdio:['pipe','pipe','pipe']});let out='',err='';let ready;const locked=new Promise(resolve=>ready=resolve);child.stdout.on('data',d=>{out+=d;if(out.includes('LOCK_READY'))ready();});child.stderr.on('data',d=>err+=d);const done=new Promise((resolve,reject)=>child.on('close',code=>code?reject(Error(err)):resolve(out)));child.stdin.end(input);return{locked,done};}
(async()=>{
 const deletedNote='66666666-6666-4666-8666-666666666666';
 const deletingEarly=held(auth+`BEGIN;SELECT delete_recording_identity('${deletedNote}','document','doc','33333333-3333-4333-8333-333333333333','${owner}');\n\\echo LOCK_READY\nSELECT pg_sleep(0.4);COMMIT;`);
 await deletingEarly.locked;
 assert.throws(()=>sql(auth+`SELECT begin_recording_operation('${deletedNote}','document','doc','33333333-3333-4333-8333-333333333333','1',2,'audio/webm',5,'Late',now(),'${owner}');`),/deleted/);
 await deletingEarly.done;
 // Reproduce Storage's rolled-back caller probe and final admin insert boundary.
 const late=JSON.parse(sql(auth+`SELECT begin_recording_operation('77777777-7777-4777-8777-777777777777','document','doc','33333333-3333-4333-8333-333333333333','1',2,'audio/webm',5,'Late bytes',now(),'${owner}');`));
 const insertLate=`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes','${late.object_path}','{"size":5,"mimetype":"audio/webm"}');`;
 sql(auth+'BEGIN;SAVEPOINT permission_probe;'+insertLate+'ROLLBACK TO SAVEPOINT permission_probe;COMMIT;');
 sql(auth+`SELECT request_recording_deletion('${late.id}');`);
 assert.throws(()=>sql(insertLate),/cancelled|deleted/);
 // Complete its empty cleanup so the claim assertion below has one target.
 sql(`UPDATE recording_private.operations SET next_attempt_at=now()+interval '1 hour' WHERE id='${op.id}';`);
 const empty=JSON.parse(sql(service+`SELECT claim_recording_operations(1);`));
 assert.equal(empty.id,late.id);
 sql(service+`SELECT complete_recording_cleanup('${late.id}','${empty.lease_token}');`);
 sql(`UPDATE recording_private.operations SET next_attempt_at=now() WHERE id='${op.id}';`);
 // Actual independent sessions: worker two skips the first worker's locked row.
 const claim=held(service+`BEGIN;SELECT claim_recording_operations(1);\n\\echo LOCK_READY\nSELECT pg_sleep(0.4);COMMIT;`);
 await claim.locked;assert.equal(sql(service+'SELECT claim_recording_operations(1);'),'');await claim.done;
 // Lost/crashed claimant expires. Reclaim, publish under service role and actual
 // document-generation triggers; parent deletion waits for publication's lock.
 sql("UPDATE recording_private.operations SET lease_until=now()-interval '1 second';");
 const job=JSON.parse(sql(service+'SELECT claim_recording_operations(1);'));
 const publishing=held(service+`BEGIN;SELECT publish_claimed_recording('${op.id}','${job.lease_token}');\n\\echo LOCK_READY\nSELECT pg_sleep(0.4);COMMIT;`);
 await publishing.locked;
 const deletion=held(auth+"BEGIN;DELETE FROM documents WHERE id='doc';COMMIT;\n\\echo LOCK_READY\n");
 await Promise.all([publishing.done,deletion.done]);
 assert.equal(sql('SELECT count(*) FROM voice_notes;'),'0');
 assert.equal(sql(`SELECT state FROM recording_private.operations WHERE id='${op.id}';`),'deleting');
 const cleanup=JSON.parse(sql(service+'SELECT claim_recording_operations(1);'));
 assert.equal(sql(service+`SELECT prepare_recording_cleanup('${op.id}','${cleanup.lease_token}');`),op.object_path);
 // Simulate successful Storage DELETE metadata acknowledgement, then fence ack.
 sql(`DELETE FROM storage.objects WHERE name='${op.object_path}';`);
 sql(service+`SELECT complete_recording_cleanup('${op.id}','${cleanup.lease_token}');`);
 assert.equal(sql(`SELECT state FROM recording_private.operations WHERE id='${op.id}';`),'deleted');
 assert.equal(sql(auth+`SELECT confirm_recording_upload('${op.id}')->>'state';`),'deleted');
 console.log('PostgreSQL: exclusive claims, crash retry, publication/deletion serialization, cascade cleanup and permanent tombstone passed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
