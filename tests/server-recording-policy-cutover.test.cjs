const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',outsider='99999999-9999-4999-8999-999999999999';
const room='44444444-4444-4444-8444-444444444444',otherRoom='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',note='55555555-5555-4555-8555-555555555555';
const roomPath=`rooms/${room}/${note}.webm`,personalPath=`${owner}/doc/66666666-6666-4666-8666-666666666666.webm`;
async function as(db,id,role='authenticated'){await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${id}';SET request.jwt.claim.role='${role}';SET request.storage.operation='object.upload';SET ROLE ${role}`);}
async function fixture(t){const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('tests/server-recording-fixture.sql','utf8'));await db.exec(fs.readFileSync('tests/fixtures/recording-deployed-policies.sql','utf8'));await db.exec(`
 INSERT INTO auth.users VALUES('${outsider}');
 INSERT INTO room_members VALUES('${room}','${member}');
 INSERT INTO study_rooms VALUES('${otherRoom}','active',now()+interval '1 day');
 INSERT INTO room_members VALUES('${otherRoom}','${outsider}');
 INSERT INTO room_voice_notes VALUES('${note}','${owner}','${room}','1',2,null,'https://storage.invalid/storage/v1/object/sign/voice-notes/${roomPath}?token=old',now());
 INSERT INTO voice_notes(id,user_id,document_id,page_number,duration,audio_url,timestamp) VALUES('66666666-6666-4666-8666-666666666666','${owner}','doc','1',2,'https://storage.invalid/storage/v1/object/sign/voice-notes/${personalPath}?token=old',now());
 INSERT INTO storage.objects(bucket_id,name) VALUES('voice-notes','${roomPath}'),('voice-notes','${personalPath}'),('voice-notes','rooms/${room}/orphan.webm'),('voice-notes','rooms/${otherRoom}/${note}.webm');
 GRANT USAGE ON SCHEMA storage TO anon;GRANT SELECT ON storage.objects TO anon;
 CREATE POLICY inherited_public_read ON storage.objects FOR SELECT TO PUBLIC USING(true);
 `);await db.exec(fs.readFileSync('supabase/migrations/20261028203014_server_recording_operations.sql','utf8'));return db;}
async function paths(db){return (await db.query('SELECT name FROM storage.objects ORDER BY name')).rows.map(row=>row.name);}
async function begin(db){return (await db.query(`SELECT begin_recording_operation('77777777-7777-4777-8777-777777777777','room',$1,null,'1',2,'audio/webm',5,'Pending',now(),$2) op`,[room,owner])).rows[0].op;}
test('legacy room objects require matching metadata and active membership despite inherited broad reads',async t=>{
 const db=await fixture(t);await as(db,outsider);assert.deepEqual(await paths(db),[]);
 await as(db,member);assert.deepEqual(await paths(db),[roomPath]);
 await as(db,owner);assert.deepEqual(await paths(db),[personalPath,roomPath]);
 await as(db,'','anon');assert.deepEqual(await paths(db),[]);
 await db.exec(`RESET ROLE;DELETE FROM room_members WHERE user_id='${member}'`);await as(db,member);assert.deepEqual(await paths(db),[]);
 await db.exec(`RESET ROLE;UPDATE study_rooms SET expires_at=now()-interval '1 second' WHERE id='${room}'`);await as(db,owner);assert.deepEqual(await paths(db),[personalPath]);
 await db.exec(`RESET ROLE;UPDATE study_rooms SET expires_at=now()+interval '1 day';DELETE FROM room_members WHERE user_id='${owner}'`);await as(db,owner);assert.deepEqual(await paths(db),[personalPath]);
});
test('closed room and deleted metadata stop legacy playback authorization',async t=>{
 const db=await fixture(t);await db.exec(`UPDATE study_rooms SET status='closed' WHERE id='${room}'`);await as(db,member);assert.deepEqual(await paths(db),[]);
 await db.exec(`RESET ROLE;UPDATE study_rooms SET status='active';DELETE FROM room_voice_notes`);await as(db,member);assert.deepEqual(await paths(db),[]);
});
test('deployed broad uploads cannot bypass tracked admission or the retained launch restriction',async t=>{
 const db=await fixture(t);await as(db,owner);
 for(const path of [`rooms/${room}/new.webm`,`${owner}/doc/new.webm`,`operations/untracked/audio.webm`])await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('voice-notes',$1)",[path]),/policy|durable recording/i);
 const op=await begin(db);for(const id of [outsider,member]){await as(db,id);await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('voice-notes',$1)",[op.object_path]),/policy/i);}
 await as(db,owner);await db.exec("SET test.launch_upload_denied='true'");await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('voice-notes',$1)",[op.object_path]),/policy/i);
 await db.exec("SET test.launch_upload_denied='false'");await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('voice-notes',$1,'{\"size\":5,\"mimetype\":\"audio/webm\"}')",[op.object_path]);await db.query('SELECT confirm_recording_upload($1)',[op.id]);
 await as(db,member);assert.deepEqual(await paths(db),[roomPath]);assert.equal((await db.query('SELECT recording_playback_path($1) path',[op.id])).rows[0].path,op.object_path);
 await as(db,outsider);await assert.rejects(db.query('SELECT recording_playback_path($1)',[op.id]),/unauthorized/i);
});
test('legacy clear RPC fails closed without acknowledging or bypassing pending and published lifecycle',async t=>{
 const db=await fixture(t);await as(db,owner);const op=await begin(db);
 for(const [id,role] of [[owner,'authenticated'],[member,'authenticated'],[owner,'service_role'],['','anon']]){await as(db,id,role);await assert.rejects(db.query('SELECT clear_own_recording_metadata()'),/permission denied/i);}
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int n FROM voice_notes')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM room_voice_notes')).rows[0].n,1);assert.equal((await db.query('SELECT state FROM recording_private.operations WHERE id=$1',[op.id])).rows[0].state,'awaiting_upload');
});
