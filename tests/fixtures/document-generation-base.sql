CREATE SCHEMA IF NOT EXISTS auth;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.role',true),''),'authenticated') $$;
CREATE TABLE profiles(id uuid PRIMARY KEY,plan text NOT NULL DEFAULT 'free',is_vip boolean NOT NULL DEFAULT false);
CREATE TABLE documents(id text PRIMARY KEY,user_id uuid NOT NULL,name text NOT NULL DEFAULT '',type text NOT NULL DEFAULT 'pdf',page_count int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE text_notes(id text PRIMARY KEY,user_id uuid,document_id text,page_key text,x float,y float,width float,height float,content text NOT NULL,font_size float,color text,category text);
CREATE TABLE drawings(id text PRIMARY KEY,user_id uuid,document_id text,page_key text,canvas_data text,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,document_id,page_key));
CREATE TABLE blank_pages(id text PRIMARY KEY,user_id uuid,document_id text,insert_after_page int,canvas_data text,images jsonb DEFAULT '[]',bg_theme text,created_at bigint);
CREATE TABLE bookmarks(id text PRIMARY KEY,user_id uuid,document_id text,virtual_index int,label text,created_at timestamptz);
CREATE TABLE key_terms(id text PRIMARY KEY,user_id uuid,document_id text,term text,definition text,created_at timestamptz);
CREATE TABLE flashcard_decks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,doc_id text,name text,description text,updated_at timestamptz);
CREATE TABLE flashcards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,doc_id text,page_num int,question text,answer text,deck_id uuid REFERENCES flashcard_decks(id) ON DELETE CASCADE,review_count int DEFAULT 0,interval_days int DEFAULT 0,next_review_at timestamptz,last_reviewed_at timestamptz);
CREATE TABLE page_image_annotations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,document_id text,page_number int,images jsonb,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,document_id,page_number));
CREATE TABLE session_state(user_id uuid PRIMARY KEY,doc_id text,virtual_index int,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE voice_notes(id text PRIMARY KEY,user_id uuid,document_id text,page_number int,audio_url text,title text);
CREATE TABLE document_tags(user_id uuid,document_id text,tag text,PRIMARY KEY(user_id,document_id,tag));
CREATE TABLE document_favorites(user_id uuid,document_id text,PRIMARY KEY(user_id,document_id));
CREATE TABLE study_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,document_id text,started_at timestamptz,ended_at timestamptz);
CREATE TABLE community_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,document_id text,title text,likes_count int DEFAULT 0);
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id' LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY own_rows ON public.%I TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid())',t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
INSERT INTO profiles VALUES ('11111111-1111-4111-8111-111111111111','pro',false),('22222222-2222-4222-8222-222222222222','pro',false),('33333333-3333-4333-8333-333333333333','free',false);
INSERT INTO documents(id,user_id,name) VALUES('existing','11111111-1111-4111-8111-111111111111','Existing');
INSERT INTO text_notes(id,user_id,document_id,page_key,content) VALUES('old-note','11111111-1111-4111-8111-111111111111','existing','1','Preserved content');
-- Hosted projects may grant service_role table privileges by default. The new
-- lifetime/receipt tables must explicitly override those defaults.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- Legacy per-column grants must also be removed by coordinated rollout.
GRANT UPDATE(content),INSERT(content) ON text_notes TO authenticated;
