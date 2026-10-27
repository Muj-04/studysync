const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('Postgres rolls back failed replacements and enforces ownership and scope', async () => {
  const db = new PGlite();
  const uid = '11111111-1111-4111-8111-111111111111';
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
    CREATE TABLE documents (id text PRIMARY KEY, user_id uuid);
    CREATE TABLE text_notes (id text PRIMARY KEY, user_id uuid, document_id text, page_key text, x float, y float, width float, height float, content text NOT NULL, font_size float, color text, category text);
    CREATE TABLE blank_pages (id text PRIMARY KEY, user_id uuid, document_id text, insert_after_page int, canvas_data text, bg_theme text, created_at bigint);
    CREATE TABLE bookmarks (id text PRIMARY KEY, user_id uuid, document_id text, virtual_index int, label text, created_at timestamptz);
    CREATE TABLE key_terms (id text PRIMARY KEY, user_id uuid, document_id text, term text, definition text, created_at timestamptz);
    CREATE TABLE flashcards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, doc_id text, page_num int, question text, answer text);
    INSERT INTO documents VALUES ('doc', '${uid}');
    INSERT INTO text_notes (id,user_id,document_id,page_key,content) VALUES ('original','${uid}','doc','1','keep me'),('other-page','${uid}','doc','2','untouched');
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    ALTER TABLE text_notes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_notes ON text_notes TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261004090000_atomic_study_collections.sql', 'utf8'));
  await db.exec(`SET ROLE authenticated; SET test.uid = '${uid}';`);
  const save = (kind, page, rows) => db.query('SELECT replace_study_collection($1,$2,$3,$4::jsonb)', [kind, 'doc', page, JSON.stringify(rows)]);
  try {
    await assert.rejects(save('text_notes', '1', [{ id: 'invalid', content: null }]));
    assert.equal((await db.query("SELECT content FROM text_notes WHERE id='original'")).rows[0].content, 'keep me');
    await save('text_notes', '1', [{ id: 'new', content: 'saved', user_id: '22222222-2222-4222-8222-222222222222', document_id: 'foreign' }]);
    const rows = (await db.query('SELECT * FROM text_notes ORDER BY id')).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].user_id, uid);
    assert.equal(rows[0].document_id, 'doc');
    await save('blank_pages', null, [{ id: 'blank', images: [{ id: 'image' }] }]);
    assert.equal((await db.query('SELECT images FROM blank_pages')).rows[0].images[0].id, 'image');
    await save('flashcards', '1', [{ question: 'Q', answer: 'A' }]);
    assert.ok((await db.query('SELECT id FROM flashcards')).rows[0].id);
    await save('text_notes', '1', []);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM text_notes')).rows[0].n, 1);
    await assert.rejects(save('profiles', null, []), /Unsupported/);
    await db.exec("SET test.uid = '22222222-2222-4222-8222-222222222222'");
    await assert.rejects(save('text_notes', '2', []), /not owned/);
    await db.exec("SET test.uid = ''");
    await assert.rejects(save('text_notes', '2', []), /Authentication/);
  } finally { await db.close(); }
});
