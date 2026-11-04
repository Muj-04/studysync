// Local-only rehearsal against the candidate checkout passed as argv[2].
// Uses synthetic fixtures, real PostgreSQL tools, and no network/provider APIs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root=path.resolve(process.argv[2]||'.'),bin=process.env.REHEARSAL_PG_BIN;
assert.ok(bin&&process.env.PGHOST?.startsWith('/tmp/'),'Explicit local PG binaries and /tmp Unix socket required');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studysync-restore-evidence-'));
const db=`integrity_rehearsal_${process.pid}`,restored=db+'_restored',before=db+'_before',bad=db+'_bad';
const databases=[];
const localEnv={...process.env};
for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE'])delete localEnv[key];
const run=(name,args,input)=>execFileSync(path.join(bin,name),args,{input,env:localEnv,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const sql=(name,input)=>run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-d',name],input).trim();
const create=name=>{sql('postgres',`CREATE DATABASE ${name}`);databases.push(name);};
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const auth=`SET request.jwt.claim.sub='${owner}';SET request.jwt.claim.role='authenticated';SET ROLE authenticated;`;
const svc=`SET request.jwt.claim.role='service_role';SET ROLE service_role;`;
let base=file('tests/server-recording-fixture.sql').replace(/CREATE ROLE (\w+);/g,(_,r)=>`DO $$BEGIN CREATE ROLE ${r};EXCEPTION WHEN duplicate_object THEN NULL;END$$;`)
 .replace(/CREATE TABLE public.document_lifetimes[\s\S]*?END\$\$;/,'')
 .replace('CREATE TABLE public.documents(id text PRIMARY KEY,user_id uuid NOT NULL,generation uuid NOT NULL);',"CREATE TABLE public.documents(id text PRIMARY KEY,user_id uuid NOT NULL,name text NOT NULL DEFAULT '',type text NOT NULL DEFAULT 'pdf',page_count int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());")
 .replace(",document_generation uuid);",");")
 .replace(",'33333333-3333-4333-8333-333333333333');",");");
base+='\n'+file('tests/fixtures/document-generation-base.sql').split('\n').filter(l=>/^CREATE TABLE /.test(l)&&!/^CREATE TABLE (documents|voice_notes)\(/.test(l)).join('\n');
base+=`\nINSERT INTO profiles(id,plan) VALUES('${owner}','pro'),('${other}','pro');
INSERT INTO text_notes(id,user_id,document_id,page_key,content) VALUES('legacy-note','${owner}','doc','1','Existing pre-migration content');
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
DO $$DECLARE t text;BEGIN FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id' LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY own_rows ON public.%I TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid())',t);END LOOP;END$$;`;
const legacy='55555555-5555-4555-8555-555555555555';
const objectPath=`${owner}/doc/${legacy}.webm`;
base+=`INSERT INTO voice_notes(id,user_id,document_id,page_number,duration,title,audio_url,audio_size_bytes,timestamp) VALUES('${legacy}','${owner}','doc','1',1,'Legacy','https://fixture.invalid/storage/v1/object/sign/voice-notes/${objectPath}?token=fixture',5,now());
INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes','${objectPath}','{"size":5,"mimetype":"audio/webm"}');`;
const documentMigration=file('supabase/migrations/20261028202847_document_generation_guards.sql');
const recordingMigration=file('supabase/migrations/20261028203014_server_recording_operations.sql');
const snapshot=name=>sql(name,`SELECT jsonb_object_agg(t,rows ORDER BY t) FROM (
SELECT 'documents' t,coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') rows FROM documents d UNION ALL
SELECT 'text_notes',coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM text_notes d UNION ALL
SELECT 'voice_notes',coalesce(jsonb_agg(to_jsonb(d) ORDER BY id),'[]') FROM voice_notes d UNION ALL
SELECT 'objects',coalesce(jsonb_agg(to_jsonb(d) ORDER BY name),'[]') FROM storage.objects d) s;`);
try{
 create(db);sql(db,base);const pre=snapshot(db);
 run('pg_dump',['-Fc','-f',path.join(dir,'before.dump'),db]);
 create(before);run('pg_restore',['--exit-on-error','-d',before,path.join(dir,'before.dump')]);assert.equal(snapshot(before),pre);
 console.log('PASS pre-cutover logical backup/restore preserves existing documents, annotations, recording metadata and object metadata');
 create(bad);run('pg_restore',['--exit-on-error','-d',bad,path.join(dir,'before.dump')]);
 sql(bad,`INSERT INTO text_notes(id,user_id,document_id,page_key,content) VALUES('orphan','${owner}','absent','1','Do not discard');`);
 assert.throws(()=>sql(bad,documentMigration),/orphan|foreign|reference/i);
 assert.equal(sql(bad,"SELECT to_regclass('public.document_lifetimes') IS NULL"),'t');
 assert.equal(sql(bad,"SELECT content FROM text_notes WHERE id='orphan'"),'Do not discard');
 console.log('PASS failed document migration rolls back schema and preserves orphan data');
 sql(db,documentMigration);
 assert.equal(sql(db,"SELECT content FROM text_notes WHERE id='legacy-note'"),'Existing pre-migration content');
 assert.equal(sql(db,"SELECT count(*) FROM text_notes WHERE document_generation IS NOT NULL"),'1');
 sql(db,"UPDATE storage.buckets SET public=true WHERE id='voice-notes'");
 assert.throws(()=>sql(db,recordingMigration),/private bucket/i);
 assert.equal(sql(db,"SELECT to_regclass('recording_private.operations') IS NULL"),'t');
 assert.equal(sql(db,'SELECT count(*) FROM voice_notes'),'1');
 sql(db,"UPDATE storage.buckets SET public=false WHERE id='voice-notes'");sql(db,recordingMigration);
 assert.equal(sql(db,"SELECT state FROM recording_private.operations WHERE legacy"),'published');
 console.log('PASS recording preflight failure rolls back; valid ordered migration adopts existing recording without losing annotations');
 const gen=sql(db,"SELECT generation FROM documents WHERE id='doc'");
 sql(db,auth+`SELECT replace_study_collection_v2('text_notes','doc','${gen}','1',0,'66666666-6666-4666-8666-666666666666','[{"id":"saved","content":"Post-cutover durable content"}]');`);
 const begin=id=>JSON.parse(sql(db,auth+`SELECT begin_recording_operation('${id}','document','doc','${gen}','1',1,'audio/webm',5,'Recovery',now(),'${owner}')`));
 const pending=begin('77777777-7777-4777-8777-777777777777');
 sql(db,auth+`SET request.storage.operation='object.upload';INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes','${pending.object_path}','{"size":5,"mimetype":"audio/webm"}');`);
 const deletedGen=sql(db,auth+`INSERT INTO documents(id,user_id) VALUES('deleted','${owner}') RETURNING generation`);
 sql(db,auth+"DELETE FROM documents WHERE id='deleted'");
 // Simulate a crashed worker lease; restore must preserve it, then recover after expiry.
 const leased=JSON.parse(sql(db,svc+'SELECT claim_recording_operations(1)'));assert.equal(leased.id,pending.id);
 const state=sql(db,"SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM recording_private.operations o");
 const lifetimes=sql(db,"SELECT jsonb_agg(to_jsonb(d) ORDER BY document_id) FROM document_lifetimes d");
 const receipts=sql(db,"SELECT jsonb_agg(to_jsonb(d) ORDER BY write_id) FROM document_collection_receipts d");
 const post=snapshot(db);run('pg_dump',['-Fc','-f',path.join(dir,'after.dump'),db]);
 create(restored);run('pg_restore',['--exit-on-error','-d',restored,path.join(dir,'after.dump')]);
 assert.equal(snapshot(restored),post);assert.equal(sql(restored,"SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM recording_private.operations o"),state);
 assert.equal(sql(restored,"SELECT jsonb_agg(to_jsonb(d) ORDER BY document_id) FROM document_lifetimes d"),lifetimes);
 assert.equal(sql(restored,"SELECT jsonb_agg(to_jsonb(d) ORDER BY write_id) FROM document_collection_receipts d"),receipts);
 console.log('PASS post-cutover logical restore preserves exact content, tombstones, write receipts, operation identities and crash leases');
 assert.throws(()=>sql(restored,auth+`INSERT INTO documents(id,user_id,generation) VALUES('deleted','${owner}','${deletedGen}')`),/deleted/i);
 assert.throws(()=>sql(restored,auth+"UPDATE text_notes SET content='stale'"),/permission denied/i);
 assert.throws(()=>sql(restored,auth+`SET request.jwt.claim.sub='${other}';SELECT read_document_collection_v2('text_notes','doc','${gen}')`),/owner|authorization/i);
 assert.throws(()=>sql(restored,auth+'SELECT claim_recording_operations(1)'),/permission denied/i);
 const retryReceipt=sql(restored,auth+`SELECT replace_study_collection_v2('text_notes','doc','${gen}','1',0,'66666666-6666-4666-8666-666666666666','[{"id":"saved","content":"Post-cutover durable content"}]');`);
 assert.ok(Number(retryReceipt)>0);
 assert.throws(()=>sql(restored,auth+`SELECT replace_study_collection_v2('text_notes','doc','${gen}','1',0,'88888888-8888-4888-8888-888888888888','[{"id":"stale","content":"Stale replacement"}]');`),/revision|conflict/i);
 assert.equal(sql(restored,svc+'SELECT claim_recording_operations(1)'), '');
 sql(restored,"UPDATE recording_private.operations SET lease_until=now()-interval '1 second',upload_deadline=now()-interval '1 day' WHERE state='awaiting_upload'");
 const retry=JSON.parse(sql(restored,svc+'SELECT claim_recording_operations(1)'));
 assert.throws(()=>sql(restored,svc+`SELECT publish_claimed_recording('${pending.id}','${leased.lease_token}')`),/lease|stale/i);
 assert.equal(JSON.parse(sql(restored,svc+`SELECT publish_claimed_recording('${retry.id}','${retry.lease_token}')`)).state,'published');
 assert.throws(()=>sql(restored,`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes','${pending.object_path}','{"size":5}')`),/cancelled|closed|published|upload|deleted/i);
 assert.throws(()=>sql(restored,`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes','${objectPath}','{"size":5}')`),/operation|legacy|untracked/i);
 console.log('PASS restored authorization/CAS/tombstones deny stale writes; expired crash lease recovers publication without duplicate or old-lease acceptance');
 console.log('PASS published/legacy Storage re-upload is rejected after restore: provider object restore needs a separate compatible procedure');
 const bytes=Buffer.from('audio');fs.mkdirSync(path.join(dir,'object-backup'));fs.writeFileSync(path.join(dir,'object-backup','audio.webm'),bytes);
 fs.cpSync(path.join(dir,'object-backup'),path.join(dir,'object-restored'),{recursive:true});
 const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(fs.readFileSync(path.join(dir,'object-restored','audio.webm'))),hash(bytes));
 console.log('PASS separate local dummy-object backup checksum; NOT a Supabase Storage API/provider restore');
 console.log('Evidence directory:',dir);
}finally{for(const name of databases.reverse())sql('postgres',`DROP DATABASE ${name}`);console.log('CLEANUP all rehearsal databases dropped');}
