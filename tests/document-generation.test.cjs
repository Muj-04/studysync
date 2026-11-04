const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync('supabase/migrations/20261028202847_document_generation_guards.sql', 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/fixtures/document-generation-base.sql', 'utf8'));
  await db.exec(migration);
  await db.exec(`SET ROLE authenticated; SET test.uid='${owner}'; SET test.role='authenticated';`);
  return db;
}

test('a legacy parent insert cannot resurrect a deleted document ID', async () => {
  const db = await setup();
  try {
    await db.exec("DELETE FROM documents WHERE id='existing'");
    await assert.rejects(db.query('INSERT INTO documents(id,user_id,name) VALUES($1,$2,$3)', ['existing', owner, 'Stale cached document']), /deleted|reus/i);
  } finally { await db.close(); }
});

const other = '22222222-2222-4222-8222-222222222222';
const free = '33333333-3333-4333-8333-333333333333';
const { randomUUID } = require('node:crypto');
async function create(db, id) {
  return (await db.query('INSERT INTO documents(id,user_id,name) VALUES($1,auth.uid(),$1) RETURNING generation', [id])).rows[0].generation;
}
async function state(db, collection, doc, gen) {
  return (await db.query('SELECT read_document_collection_v2($1,$2,$3) AS value', [collection,doc,gen])).rows[0].value;
}
async function replace(db, collection, doc, gen, page, revision, rows, write = randomUUID()) {
  return Number((await db.query('SELECT replace_study_collection_v2($1,$2,$3,$4,$5,$6,$7::jsonb) AS revision', [collection,doc,gen,page,revision,write,JSON.stringify(rows)])).rows[0].revision);
}

test('generation migration preserves live data and guards every discovered document child', async t => {
  const db = await setup();
  try {
    const gen = (await db.query("SELECT generation FROM documents WHERE id='existing'")).rows[0].generation;
    await t.test('existing live rows are backfilled without rewriting content', async () => {
      const row = (await db.query("SELECT * FROM text_notes WHERE id='old-note'")).rows[0];
      assert.equal(row.document_generation, gen); assert.equal(row.content, 'Preserved content');
      const constraints = (await db.query("SELECT count(*)::int n FROM pg_constraint WHERE conname='document_generation_parent_fk'")).rows[0].n;
      assert.equal(constraints, 14);
    });
    await t.test('immutable document identity and unauthorized lifetime edits are denied', async () => {
      for (const statement of ["UPDATE documents SET id='renamed' WHERE id='existing'", "UPDATE documents SET user_id='22222222-2222-4222-8222-222222222222' WHERE id='existing'", "UPDATE documents SET generation=gen_random_uuid() WHERE id='existing'"]) await assert.rejects(db.exec(statement));
      await assert.rejects(db.exec("DELETE FROM document_lifetimes WHERE document_id='existing'"), /permission denied/);
      await assert.rejects(db.exec("UPDATE document_lifetimes SET deleted_at=NULL"), /permission denied/);
    });
    await t.test('service-role defaults cannot rewrite permanent lifetime history', async () => {
      await db.exec('RESET ROLE; SET ROLE service_role');
      await assert.rejects(db.exec("UPDATE document_lifetimes SET deleted_at=now() WHERE document_id='existing'"), /permission denied/);
      await assert.rejects(db.exec('DELETE FROM document_collection_receipts'), /permission denied/);
      await db.exec(`RESET ROLE; SET ROLE authenticated; SET test.uid='${owner}'`);
    });
    await t.test('missing, forged generation and foreign-owner child writes fail closed', async () => {
      // Non-replay children still use direct mutations, so exercise the actual
      // lifetime guard as well as replay-table privilege denial below.
      await assert.rejects(db.query("INSERT INTO voice_notes(id,user_id,document_id,page_number) VALUES('legacy-voice',$1,'existing',1)",[owner]),error=>error.code==='PDD02');
      await assert.rejects(db.query("INSERT INTO voice_notes(id,user_id,document_id,document_generation,page_number) VALUES('forged-voice',$1,'existing',$2,1)",[owner,randomUUID()]),error=>error.code==='PDD02');
      await db.exec(`SET test.uid='${other}'`);
      await assert.rejects(db.query("INSERT INTO voice_notes(id,user_id,document_id,document_generation,page_number) VALUES('foreign-voice',$1,'existing',$2,1)",[other,gen]),error=>error.code==='42501');
      await db.exec(`SET test.uid='${owner}'`);
      await assert.rejects(db.query("INSERT INTO text_notes(id,user_id,document_id,page_key,content) VALUES('legacy',$1,'existing','1','stale')", [owner]), error => ['PDD02','42501'].includes(error.code));
      await assert.rejects(db.query("INSERT INTO text_notes(id,user_id,document_id,document_generation,page_key,content) VALUES('forged',$1,'existing',$2,'1','stale')", [owner,randomUUID()]), error => ['PDD02','42501'].includes(error.code));
      await db.exec(`SET test.uid='${other}'`);
      await assert.rejects(db.query("INSERT INTO text_notes(id,user_id,document_id,document_generation,page_key,content) VALUES('foreign',$1,'existing',$2,'1','stale')", [other,gen]), error => error.code === '42501');
      await assert.rejects(db.query('SELECT assert_document_generation($1,$2,$3)', ['existing',gen,owner]), error => error.code === '42501');
      await db.exec(`SET test.uid='${owner}'`);
    });
    await t.test('CAS receipts bind the exact payload, scope and revision', async () => {
      const rows = [{ id: 'saved', content: 'new', user_id: other, document_id: 'foreign' }]; const write = randomUUID();
      const revision = await replace(db,'text_notes','existing',gen,'1',0,rows,write);
      assert.ok(revision>0);
      assert.equal(await replace(db,'text_notes','existing',gen,'1',0,rows,write), revision);
      const snapshot = await state(db,'text_notes','existing',gen);
      assert.equal(snapshot.revisions['1'], revision);
      assert.equal(snapshot.rows[0].user_id, owner); assert.equal(snapshot.rows[0].document_id, 'existing');
      await assert.rejects(replace(db,'text_notes','existing',gen,'1',0,[{id:'saved',content:'different'}],write), error => error.code === 'PDC02');
      await assert.rejects(replace(db,'text_notes','existing',gen,'2',0,rows,write), error => error.code === 'PDC02');
      await assert.rejects(replace(db,'text_notes','existing',gen,'1',0,rows), error => error.code === 'PDC01');
      await assert.rejects(replace(db,'text_notes','existing',gen,'1',revision,[{id:'invalid',content:null}]));
      assert.deepEqual(await state(db,'text_notes','existing',gen), snapshot, 'failed transaction retains rows, revision and receipt boundary');
    });
    await t.test('legacy direct writes cannot bypass collection compare-and-swap', async () => {
      const before = await state(db,'text_notes','existing',gen);
      for (const sql of ["UPDATE text_notes SET content='stale' WHERE id='saved'", "DELETE FROM text_notes WHERE id='saved'", "INSERT INTO text_notes(id,user_id,document_id,document_generation,page_key,content) SELECT 'stale',user_id,id,generation,'1','stale' FROM documents WHERE id='existing'"]) await assert.rejects(db.exec(sql), /permission denied/);
      assert.deepEqual(await state(db,'text_notes','existing',gen),before);
    });
    await t.test('all collection shapes support generation-bound acknowledged replacements', async () => {
      const fixtures = [
        ['bookmarks',null,[{id:'bookmark',virtual_index:1,label:'One'}]],
        ['key_terms',null,[{id:'term',term:'T',definition:'D'}]],
        ['blank_pages',null,[{id:'blank',insert_after_page:1,images:[],bg_theme:'white',created_at:1}]],
        ['flashcards','1',[{question:'Q',answer:'A'}]],
        ['drawings','1',[{canvas_data:'canvas'}]],
        ['page_image_annotations','1',[{images:[{id:'image'}]}]],
        ['session_state',null,[{virtual_index:1}]],
      ];
      for (const [collection,page,rows] of fixtures) {
        const revision = await replace(db,collection,'existing',gen,page,0,rows);
        const snapshot = await state(db,collection,'existing',gen);
        assert.equal(snapshot.rows.length,1,collection); assert.equal(snapshot.revisions[page??''],revision);
        assert.equal(snapshot.rows[0].document_generation,gen);
        const cleared = await replace(db,collection,'existing',gen,page,revision,[]);
        assert.ok(cleared>revision); assert.equal((await state(db,collection,'existing',gen)).rows.length,0);
      }
    });
    await t.test('narrow deck and review RPCs preserve ownership and review CAS', async () => {
      const deck = (await db.query("SELECT create_flashcard_deck_v2('Standalone','',NULL,NULL,'[{\"question\":\"Q\",\"answer\":\"A\"}]',auth.uid()) AS id")).rows[0].id;
      const card = (await db.query('SELECT * FROM flashcards WHERE deck_id=$1',[deck])).rows[0];
      assert.equal(card.doc_id,`deck:${deck}`);
      const reviewed = (await db.query("SELECT review_flashcard_v2($1,0,'easy') AS card",[card.id])).rows[0].card;
      assert.equal(reviewed.review_count,1); assert.equal(reviewed.interval_days,4);
      await assert.rejects(db.query("SELECT review_flashcard_v2($1,0,'good')",[card.id]),error=>error.code==='PDC01');
      await db.exec(`SET test.uid='${other}'`);
      await assert.rejects(db.query("SELECT review_flashcard_v2($1,1,'easy')",[card.id]),error=>error.code==='42501');
      await assert.rejects(db.query("SELECT create_flashcard_deck_v2('Foreign','','existing',$1,'[]',auth.uid())",[gen]),error=>error.code==='42501');
      await db.exec(`SET test.uid='${owner}'`);
      await assert.rejects(db.query("SELECT create_flashcard_deck_v2('Invalid','',NULL,NULL,'[{\"question\":\"\",\"answer\":\"A\"}]',auth.uid())"));
      assert.equal((await db.query("SELECT count(*)::int n FROM flashcard_decks WHERE name='Invalid'")).rows[0].n,0);
    });
    await t.test('position and explicit drawing clear use narrow authorized RPCs', async () => {
      await db.query('SELECT save_document_position_v2($1,$2,4)',['existing',gen]);
      assert.equal((await db.query('SELECT virtual_index FROM session_state WHERE user_id=$1',[owner])).rows[0].virtual_index,4);
      await replace(db,'drawings','existing',gen,'clear',0,[{canvas_data:'owned'}]);
      await db.exec(`SET test.uid='${other}'`);
      await assert.rejects(db.query('SELECT clear_account_drawings_v2($1)',[owner]), error=>error.code==='42501');
      await assert.rejects(db.query("SELECT create_flashcard_deck_v2('Wrong owner','',NULL,NULL,'[]',$1)",[owner]), error=>error.code==='42501');
      await db.exec(`SELECT clear_account_drawings_v2(auth.uid()); SET test.uid='${owner}'`);
      assert.equal((await db.query('SELECT count(*)::int n FROM drawings')).rows[0].n,1);
      await db.exec('SELECT clear_account_drawings_v2(auth.uid())');
      assert.equal((await db.query('SELECT count(*)::int n FROM drawings')).rows[0].n,0);
    });
    await t.test('a guarded document delete atomically tombstones and cascades its children', async () => {
      await replace(db,'text_notes','existing',gen,'1',(await state(db,'text_notes','existing',gen)).revisions['1'],[{id:'cascade',content:'gone'}]);
      await db.exec("DELETE FROM documents WHERE id='existing'");
      await db.exec('RESET ROLE');
      assert.equal((await db.query("SELECT count(*)::int n FROM document_collection_receipts WHERE document_id='existing'")).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int n FROM document_collection_revisions WHERE document_id='existing'")).rows[0].n,0);
      await db.exec('SET ROLE authenticated');
      assert.equal((await db.query("SELECT count(*)::int n FROM text_notes WHERE document_id='existing'")).rows[0].n,0);
      assert.equal((await db.query("SELECT generation FROM document_tombstones WHERE document_id='existing'")).rows[0].generation,gen);
      await assert.rejects(replace(db,'text_notes','existing',gen,'1',0,[]),error=>error.code==='PDD01');
      await assert.rejects(db.query("INSERT INTO documents(id,user_id,generation) VALUES('existing',$1,$2) ON CONFLICT(id) DO UPDATE SET name='stale'",[owner,gen]),error=>error.code==='PDD01');
      await db.exec(`SET test.uid='${other}'`);
      assert.equal((await db.query('SELECT * FROM document_tombstones')).rows.length,0);
      await db.exec(`SET test.uid='${owner}'`);
      assert.ok(await create(db,'explicit-recovery-new-id'));
    });
    await t.test('legacy collection RPC cannot bypass compare-and-swap', async () => {
      await assert.rejects(db.query("SELECT replace_study_collection('bookmarks','explicit-recovery-new-id',NULL,'[]')"), /permission denied|upgrade/);
    });
    await t.test('free document quota applies to new IDs, including recovery copies', async () => {
      await db.exec(`SET test.uid='${free}'`);
      for (let index=0; index<3; index++) await create(db,`free-${index}`);
      await assert.rejects(create(db,'free-over-quota'),error=>error.code==='PDQ01');
      await db.exec("DELETE FROM documents WHERE id='free-0'");
      await assert.rejects(create(db,'free-0'),error=>error.code==='PDD01');
      await create(db,'free-recovery-new-id');
      await db.exec(`SET test.uid='${owner}'`);
    });
    await t.test('legitimate cross-owner community counter RPC remains compatible', async () => {
      const docgen = (await db.query("SELECT generation FROM documents WHERE id='explicit-recovery-new-id'")).rows[0].generation;
      const post = randomUUID();
      await db.query("INSERT INTO community_posts(id,user_id,document_id,document_generation,title) VALUES($1,$2,'explicit-recovery-new-id',$3,'Shared')",[post,owner,docgen]);
      await db.exec(`RESET ROLE; CREATE FUNCTION public.test_like_post(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth'; END IF; UPDATE community_posts SET likes_count=likes_count+1 WHERE id=p_id; END $$; GRANT EXECUTE ON FUNCTION public.test_like_post(uuid) TO authenticated; SET ROLE authenticated; SET test.uid='${other}';`);
      await db.query('SELECT test_like_post($1)',[post]);
      await db.exec(`SET test.uid='${owner}'`);
      assert.equal((await db.query('SELECT likes_count FROM community_posts WHERE id=$1',[post])).rows[0].likes_count,1);
    });
    await t.test('deleting a source document detaches independent posts and historical rows', async () => {
      await db.exec(`SET test.uid='${owner}'`);
      const generation = await create(db,'shared-source'); const post = randomUUID(); const deck = randomUUID();
      await db.query("INSERT INTO community_posts(id,user_id,document_id,document_generation,title) VALUES($1,$2,'shared-source',$3,'Independent shared copy')",[post,owner,generation]);
      await db.query("INSERT INTO study_sessions(user_id,document_id,document_generation) VALUES($1,'shared-source',$2)",[owner,generation]);
      await db.query("INSERT INTO flashcard_decks(id,user_id,doc_id,document_generation,name) VALUES($1,$2,'shared-source',$3,'Keep deck')",[deck,owner,generation]);
      await db.exec("DELETE FROM documents WHERE id='shared-source'");
      const retained = (await db.query('SELECT document_id,document_generation,title FROM community_posts WHERE id=$1',[post])).rows[0];
      assert.deepEqual(retained,{document_id:null,document_generation:null,title:'Independent shared copy'});
      assert.equal((await db.query('SELECT count(*)::int n FROM study_sessions WHERE document_id IS NULL')).rows[0].n,1);
      assert.equal((await db.query('SELECT doc_id FROM flashcard_decks WHERE id=$1',[deck])).rows[0].doc_id,null);
    });
  } finally { await db.close(); }
});

test('orphan legacy data blocks migration without silent deletion', async () => {
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync('tests/fixtures/document-generation-base.sql','utf8'));
    await db.query("INSERT INTO text_notes(id,user_id,document_id,page_key,content) VALUES('orphan',$1,'missing','1','Recover me')",[owner]);
    await assert.rejects(db.exec(migration), /orphan or foreign/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT content FROM text_notes WHERE id='orphan'")).rows[0].content,'Recover me');
  } finally { await db.close(); }
});
