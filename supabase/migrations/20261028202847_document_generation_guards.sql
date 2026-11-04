-- Coordinated client rollout required: deleted IDs never become writable again.
BEGIN;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS generation uuid NOT NULL DEFAULT gen_random_uuid();
REVOKE TRUNCATE ON public.documents FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS documents_owner_quota_idx ON public.documents(user_id);
ALTER TABLE public.documents ADD CONSTRAINT documents_owner_generation_unique UNIQUE(id,user_id,generation);

CREATE TABLE public.document_lifetimes (
 document_id text PRIMARY KEY, user_id uuid NOT NULL, generation uuid NOT NULL,
 deleted_at timestamptz, UNIQUE(document_id,user_id,generation)
);
INSERT INTO public.document_lifetimes(document_id,user_id,generation)
 SELECT id::text,user_id,generation FROM public.documents;
ALTER TABLE public.document_lifetimes ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_lifetimes_owner_read ON public.document_lifetimes FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.document_lifetimes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.document_lifetimes TO authenticated,service_role;
CREATE VIEW public.document_tombstones WITH(security_invoker=true) AS
 SELECT document_id,user_id,generation,deleted_at FROM public.document_lifetimes WHERE deleted_at IS NOT NULL;
REVOKE ALL ON public.document_tombstones FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.document_tombstones TO authenticated,service_role;

-- Updating this epoch serializes quota checks even for repeatable-read callers.
CREATE TABLE public.document_owner_epochs(user_id uuid PRIMARY KEY, revision bigint NOT NULL DEFAULT 0);
REVOKE ALL ON public.document_owner_epochs FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.document_owner_epochs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assert_document_generation(p_document_id text,p_generation uuid,p_owner uuid DEFAULT auth.uid())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lifetime public.document_lifetimes%ROWTYPE; actual uuid;
BEGIN
 IF p_owner IS NULL OR (coalesce(auth.role(),'')<>'service_role' AND auth.uid() IS DISTINCT FROM p_owner) THEN
  RAISE EXCEPTION 'Document owner authorization required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO lifetime FROM public.document_lifetimes WHERE document_id=p_document_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document missing or deleted' USING ERRCODE='PDD01'; END IF;
 IF lifetime.user_id<>p_owner THEN RAISE EXCEPTION 'Document belongs to another owner' USING ERRCODE='42501'; END IF;
 IF lifetime.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Document permanently deleted' USING ERRCODE='PDD01'; END IF;
 IF p_generation IS NULL OR lifetime.generation<>p_generation THEN RAISE EXCEPTION 'Document generation mismatch' USING ERRCODE='PDD02'; END IF;
 SELECT generation INTO actual FROM public.documents WHERE id::text=p_document_id AND user_id=p_owner FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document missing or deleted' USING ERRCODE='PDD01'; END IF;
 IF actual<>p_generation THEN RAISE EXCEPTION 'Document generation mismatch' USING ERRCODE='PDD02'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_document_generation(text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assert_document_generation(text,uuid,uuid) TO authenticated,service_role;

CREATE FUNCTION public.guard_document_lifetime() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target_owner uuid; lifetime public.document_lifetimes%ROWTYPE; plan_name text; vip boolean; document_count bigint;
BEGIN
 target_owner := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 IF target_owner IS NULL OR (coalesce(auth.role(),'')<>'service_role' AND auth.uid() IS DISTINCT FROM target_owner) THEN
  RAISE EXCEPTION 'Document owner authorization required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.generation IS DISTINCT FROM OLD.generation) THEN
  RAISE EXCEPTION 'Document identity and generation are immutable' USING ERRCODE='PDD02';
 END IF;
 IF TG_OP='INSERT' THEN
  -- AFTER INSERT is deliberate: ON CONFLICT/unique-row waits have resolved.
  -- Locking the permanent anchor then observes a committed delete, or raises
  -- a serialization error for a stale repeatable-read snapshot.
  INSERT INTO public.document_lifetimes(document_id,user_id,generation) VALUES(NEW.id::text,NEW.user_id,NEW.generation) ON CONFLICT DO NOTHING;
  SELECT * INTO lifetime FROM public.document_lifetimes WHERE document_id=NEW.id::text FOR UPDATE;
  IF lifetime.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Deleted document IDs cannot be reused' USING ERRCODE='PDD01'; END IF;
  IF lifetime.user_id<>NEW.user_id THEN RAISE EXCEPTION 'Document ID belongs to another owner' USING ERRCODE='42501'; END IF;
  IF lifetime.generation<>NEW.generation THEN RAISE EXCEPTION 'Document generation mismatch' USING ERRCODE='PDD02'; END IF;
  INSERT INTO public.document_owner_epochs(user_id,revision) VALUES(NEW.user_id,1)
   ON CONFLICT(user_id) DO UPDATE SET revision=document_owner_epochs.revision+1;
  SELECT plan,is_vip INTO plan_name,vip FROM public.profiles WHERE id=NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document owner profile missing' USING ERRCODE='42501'; END IF;
  IF NOT coalesce(vip,false) AND coalesce(plan_name,'free') NOT IN ('premium','pro') THEN
   SELECT count(*) INTO document_count FROM public.documents WHERE user_id=NEW.user_id;
   IF document_count>3 THEN RAISE EXCEPTION 'Document quota exceeded' USING ERRCODE='PDQ01'; END IF;
  END IF;
 ELSIF TG_OP='DELETE' THEN
  DELETE FROM public.document_collection_receipts WHERE document_id=OLD.id::text AND user_id=OLD.user_id;
  DELETE FROM public.document_collection_revisions WHERE document_id=OLD.id::text AND user_id=OLD.user_id;
  UPDATE public.document_lifetimes SET deleted_at=coalesce(deleted_at,clock_timestamp())
   WHERE document_id=OLD.id::text AND user_id=OLD.user_id AND generation=OLD.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document lifetime missing' USING ERRCODE='PDD01'; END IF;
 ELSE
  PERFORM public.assert_document_generation(NEW.id::text,NEW.generation,NEW.user_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_document_lifetime() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER document_lifetime_insert AFTER INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_document_lifetime();
CREATE TRIGGER document_lifetime_change BEFORE UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_document_lifetime();

CREATE TABLE public.document_collection_revisions(
 user_id uuid NOT NULL,document_id text NOT NULL,generation uuid NOT NULL,
 collection text NOT NULL,page_key text NOT NULL DEFAULT '',revision bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,document_id,generation,collection,page_key)
);
CREATE TABLE public.document_collection_receipts(
 user_id uuid NOT NULL,write_id uuid NOT NULL,document_id text NOT NULL,generation uuid NOT NULL,
 collection text NOT NULL,page_key text NOT NULL,expected_revision bigint NOT NULL,payload jsonb NOT NULL,revision bigint NOT NULL,
 PRIMARY KEY(user_id,write_id)
);
ALTER TABLE public.document_collection_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_collection_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_collection_revisions,public.document_collection_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY collection_revision_owner_read ON public.document_collection_revisions FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON public.document_collection_revisions TO authenticated,service_role;

CREATE FUNCTION public.guard_document_child() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 ref text; owner uuid; gen uuid; deck record; identity_unchanged boolean:=false;
BEGIN
 ref:=row_data->>TG_ARGV[0]; owner:=(row_data->>'user_id')::uuid; gen:=(row_data->>'document_generation')::uuid;
 IF TG_OP='UPDATE' THEN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Document child owner is immutable' USING ERRCODE='42501'; END IF;
  identity_unchanged:=ref IS NOT DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[0]) AND NEW.document_generation IS NOT DISTINCT FROM OLD.document_generation;
 END IF;
 -- Existing RLS / vetted definer RPCs authorize unchanged-identity updates
 -- (for example another user's like counter). The lifetime check still runs.
 IF NOT identity_unchanged AND (owner IS NULL OR (coalesce(auth.role(),'')<>'service_role' AND auth.uid() IS DISTINCT FROM owner)) THEN
  RAISE EXCEPTION 'Document child owner authorization required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF ref IS NULL THEN
  IF gen IS NOT NULL THEN RAISE EXCEPTION 'Detached row cannot retain a document generation' USING ERRCODE='PDD02'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='flashcards' AND row_data->>'deck_id' IS NOT NULL THEN
  SELECT user_id,doc_id,document_generation INTO deck FROM public.flashcard_decks WHERE id::text=row_data->>'deck_id' FOR KEY SHARE;
  IF NOT FOUND OR deck.user_id IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Flashcard deck is not owned by caller' USING ERRCODE='42501'; END IF;
  IF ref='deck:'||(row_data->>'deck_id') AND deck.doc_id IS NULL AND gen IS NULL THEN RETURN NEW; END IF;
  IF deck.doc_id IS DISTINCT FROM ref OR deck.document_generation IS DISTINCT FROM gen THEN RAISE EXCEPTION 'Flashcard deck document mismatch' USING ERRCODE='PDD02'; END IF;
 END IF;
 IF identity_unchanged THEN
  PERFORM 1 FROM public.documents WHERE id::text=ref AND user_id=owner AND generation=gen FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document missing or generation changed' USING ERRCODE='PDD01'; END IF;
 ELSE
  PERFORM public.assert_document_generation(ref,gen,owner);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_document_child() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.bump_document_collection_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb; previous_scope jsonb; current_scope jsonb; scope jsonb;
BEGIN
 IF TG_TABLE_NAME NOT IN ('text_notes','bookmarks','key_terms','blank_pages','flashcards','drawings','page_image_annotations','session_state') THEN RETURN NULL; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(CASE TG_OP WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW)) WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD)) ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
  IF row_data->>'document_generation' IS NULL OR row_data->>TG_ARGV[0] IS NULL THEN CONTINUE; END IF;
  -- Parent deletion purges receipts/revisions before cascading children.
  IF EXISTS(SELECT 1 FROM public.document_lifetimes WHERE document_id=row_data->>TG_ARGV[0] AND deleted_at IS NOT NULL) THEN CONTINUE; END IF;
  current_scope:=jsonb_build_object('owner',row_data->>'user_id','doc',row_data->>TG_ARGV[0],'gen',row_data->>'document_generation','page',
   CASE TG_TABLE_NAME WHEN 'text_notes' THEN row_data->>'page_key' WHEN 'drawings' THEN row_data->>'page_key' WHEN 'flashcards' THEN row_data->>'page_num' WHEN 'page_image_annotations' THEN row_data->>'page_number' ELSE '' END);
  IF current_scope=previous_scope THEN CONTINUE; END IF;
  previous_scope:=current_scope; scope:=current_scope;
  INSERT INTO public.document_collection_revisions(user_id,document_id,generation,collection,page_key,revision)
   VALUES((scope->>'owner')::uuid,scope->>'doc',(scope->>'gen')::uuid,TG_TABLE_NAME,coalesce(scope->>'page',''),1)
   ON CONFLICT(user_id,document_id,generation,collection,page_key) DO UPDATE SET revision=document_collection_revisions.revision+1;
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.bump_document_collection_revision() FROM PUBLIC,anon,authenticated;

-- Discover the hosted shape rather than silently guarding only a hardcoded
-- subset. Room-local references belong to room authority, not personal docs.
DO $$
DECLARE child record; old_fk record; orphan_count bigint; exempt text; delete_action text;
BEGIN
 FOR child IN
  SELECT c.table_name,c.column_name FROM information_schema.columns c
  JOIN pg_class rel ON rel.oid=format('public.%I',c.table_name)::regclass AND rel.relkind='r'
  WHERE c.table_schema='public' AND c.column_name IN ('document_id','doc_id')
   AND c.table_name NOT IN ('document_lifetimes','document_collection_revisions','document_collection_receipts')
   AND EXISTS(SELECT 1 FROM information_schema.columns u WHERE u.table_schema='public' AND u.table_name=c.table_name AND u.column_name='user_id')
   AND NOT EXISTS(SELECT 1 FROM information_schema.columns r WHERE r.table_schema='public' AND r.table_name=c.table_name AND r.column_name='room_id')
 LOOP
  IF child.table_name NOT IN ('text_notes','drawings','bookmarks','key_terms','blank_pages','page_image_annotations','voice_notes','document_tags','document_favorites','study_sessions','community_posts','session_state','flashcard_decks','flashcards') THEN
   RAISE EXCEPTION 'Unreviewed document-linked table % requires an explicit deletion policy',child.table_name;
  END IF;
  EXECUTE format('REVOKE TRUNCATE ON public.%I FROM PUBLIC,anon,authenticated,service_role',child.table_name);
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS document_generation uuid',child.table_name);
  EXECUTE format('UPDATE public.%I c SET document_generation=d.generation FROM public.documents d WHERE c.%I::text=d.id::text AND c.user_id=d.user_id AND c.document_generation IS NULL',child.table_name,child.column_name);
  exempt:='false';
  IF child.table_name='flashcards' THEN
   exempt:='EXISTS(SELECT 1 FROM public.flashcard_decks deck WHERE deck.id=c.deck_id AND deck.user_id=c.user_id AND deck.doc_id IS NULL AND c.doc_id=''deck:''||deck.id::text AND c.document_generation IS NULL)';
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I c WHERE c.%I IS NOT NULL AND NOT (%s) AND NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id::text=c.%I::text AND d.user_id=c.user_id AND d.generation=c.document_generation)',child.table_name,child.column_name,exempt,child.column_name) INTO orphan_count;
  IF orphan_count>0 THEN RAISE EXCEPTION 'Document generation migration blocked: % orphan or foreign rows in %; reconcile explicitly',orphan_count,child.table_name; END IF;
  delete_action:='CASCADE';
  IF child.table_name IN ('community_posts','study_sessions','flashcard_decks','session_state') THEN
   IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=child.table_name AND column_name=child.column_name AND is_nullable='NO') THEN
    RAISE EXCEPTION 'Cannot detach nonnullable document reference %.%; reconcile deletion policy explicitly',child.table_name,child.column_name;
   END IF;
   delete_action:=format('SET NULL (%I, document_generation)',child.column_name);
  END IF;
  -- Replace older document-only FKs so their cascade cannot destroy an
  -- independently retained post/history row before the generation FK detaches it.
  FOR old_fk IN SELECT con.conname FROM pg_constraint con
   JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attname=child.column_name
   WHERE con.contype='f' AND con.conrelid=format('public.%I',child.table_name)::regclass
    AND con.confrelid='public.documents'::regclass AND att.attnum=ANY(con.conkey)
  LOOP EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',child.table_name,old_fk.conname); END LOOP;
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY(%I,user_id,document_generation) REFERENCES public.documents(id,user_id,generation) ON DELETE %s',child.table_name,child.column_name,delete_action);
  EXECUTE format('CREATE INDEX ON public.%I(%I,user_id,document_generation)',child.table_name,child.column_name);
  EXECUTE format('CREATE TRIGGER document_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_document_child(%L)',child.table_name,child.column_name);
  EXECUTE format('CREATE TRIGGER document_child_revision AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_document_collection_revision(%L)',child.table_name,child.column_name);
 END LOOP;
END $$;

CREATE FUNCTION public.document_collection_definition(p_collection text)
RETURNS TABLE(doc_column text,page_column text,write_columns text) LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
BEGIN
 doc_column:='document_id'; page_column:=NULL;
 CASE p_collection
 WHEN 'text_notes' THEN page_column:='page_key'; write_columns:='id,user_id,document_id,document_generation,page_key,x,y,width,height,content,font_size,color,category';
 WHEN 'bookmarks' THEN write_columns:='id,user_id,document_id,document_generation,virtual_index,label,created_at';
 WHEN 'key_terms' THEN write_columns:='id,user_id,document_id,document_generation,term,definition,created_at';
 WHEN 'blank_pages' THEN write_columns:='id,user_id,document_id,document_generation,insert_after_page,canvas_data,images,bg_theme,created_at';
 WHEN 'flashcards' THEN doc_column:='doc_id'; page_column:='page_num'; write_columns:='id,user_id,doc_id,document_generation,page_num,question,answer,deck_id';
 WHEN 'drawings' THEN page_column:='page_key'; write_columns:='id,user_id,document_id,document_generation,page_key,canvas_data,updated_at';
 WHEN 'page_image_annotations' THEN page_column:='page_number'; write_columns:='user_id,document_id,document_generation,page_number,images,updated_at';
 WHEN 'session_state' THEN doc_column:='doc_id'; write_columns:='user_id,doc_id,document_generation,virtual_index,updated_at';
 ELSE RAISE EXCEPTION 'Unsupported document collection' USING ERRCODE='22023';
 END CASE;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.document_collection_definition(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.read_document_collection_v2(p_collection text,p_document_id text,p_generation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); definition record; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO definition FROM public.document_collection_definition(p_collection);
 PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 -- Both subqueries share one statement snapshot. Reading a revision after a
 -- separate data request would incorrectly acknowledge a newer remote edit.
 EXECUTE format('SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.%I r WHERE user_id=$1 AND %I::text=$2 AND document_generation=$3),''[]''::jsonb),''revisions'',coalesce((SELECT jsonb_object_agg(page_key,revision) FROM public.document_collection_revisions WHERE user_id=$1 AND document_id=$2 AND generation=$3 AND collection=$4),''{}''::jsonb))',p_collection,definition.doc_column)
 INTO result USING uid,p_document_id,p_generation,p_collection;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_document_collection_v2(text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_document_collection_v2(text,text,uuid) TO authenticated;

CREATE FUNCTION public.replace_study_collection_v2(p_collection text,p_document_id text,p_generation uuid,
 p_page_key text,p_expected_revision bigint,p_write_id uuid,p_rows jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); definition record; page text:=coalesce(p_page_key,''); current_revision bigint;
 receipt public.document_collection_receipts%ROWTYPE; scope jsonb; rows_to_write jsonb; suffix text:='';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_write_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Write ID, nonnegative expected revision and row array required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO definition FROM public.document_collection_definition(p_collection);
 IF definition.page_column IS NOT NULL AND (p_page_key IS NULL OR p_page_key='') THEN RAISE EXCEPTION 'Page key required' USING ERRCODE='22023'; END IF;
 IF definition.page_column IS NULL AND page<>'' THEN RAISE EXCEPTION 'Whole collection requires an empty page key' USING ERRCODE='22023'; END IF;
 IF p_collection IN ('drawings','page_image_annotations','session_state') AND jsonb_array_length(p_rows)>1 THEN RAISE EXCEPTION 'Singleton scope requires at most one row' USING ERRCODE='22023'; END IF;
 PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 PERFORM pg_advisory_xact_lock(hashtextextended('document-write:'||uid::text||':'||p_write_id::text,0));
 SELECT * INTO receipt FROM public.document_collection_receipts WHERE user_id=uid AND write_id=p_write_id;
 IF FOUND THEN
  IF receipt.document_id<>p_document_id OR receipt.generation<>p_generation OR receipt.collection<>p_collection OR receipt.page_key<>page OR receipt.expected_revision<>p_expected_revision OR receipt.payload<>p_rows THEN
   RAISE EXCEPTION 'Write ID reused with different payload or scope' USING ERRCODE='PDC02';
  END IF;
  RETURN receipt.revision;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('document-collection:'||uid::text||':'||p_document_id||':'||p_generation::text||':'||p_collection,0));
 -- Locking the revision row also serializes authorized ancillary row mutations. An
 -- ordinary deadlock/serialization error is retryable; it never commits a stale
 -- replacement. Session state has a single row per owner, across documents.
 IF p_collection='session_state' THEN PERFORM pg_advisory_xact_lock(hashtextextended('document-session:'||uid::text,0)); END IF;
 INSERT INTO public.document_collection_revisions(user_id,document_id,generation,collection,page_key,revision)
  VALUES(uid,p_document_id,p_generation,p_collection,page,0) ON CONFLICT DO NOTHING;
 SELECT revision INTO current_revision FROM public.document_collection_revisions
  WHERE user_id=uid AND document_id=p_document_id AND generation=p_generation AND collection=p_collection AND page_key=page FOR UPDATE;
 IF current_revision<>p_expected_revision THEN RAISE EXCEPTION 'Document collection revision conflict' USING ERRCODE='PDC01'; END IF;
 scope:=jsonb_build_object('user_id',uid,definition.doc_column,p_document_id,'document_generation',p_generation);
 IF definition.page_column IS NOT NULL THEN
  scope:=scope||jsonb_build_object(definition.page_column,CASE WHEN definition.page_column IN ('page_num','page_number') THEN to_jsonb(page::integer) ELSE to_jsonb(page) END);
 END IF;
 SELECT coalesce(jsonb_agg(value||scope||CASE WHEN p_collection IN ('drawings','page_image_annotations','session_state') THEN jsonb_build_object('updated_at',now()) ELSE '{}'::jsonb END||CASE
  WHEN p_collection='flashcards' THEN jsonb_build_object('id',coalesce(value->>'id',gen_random_uuid()::text),'deck_id',NULL)
  WHEN p_collection='drawings' THEN jsonb_build_object('id',uid::text||'_'||p_document_id||'_'||page)
  ELSE '{}'::jsonb END),'[]'::jsonb) INTO rows_to_write FROM jsonb_array_elements(p_rows);
 EXECUTE format('DELETE FROM public.%I r WHERE to_jsonb(r) @> $1',p_collection) USING scope;
 IF p_collection='session_state' THEN suffix:=' ON CONFLICT(user_id) DO UPDATE SET doc_id=excluded.doc_id,document_generation=excluded.document_generation,virtual_index=excluded.virtual_index,updated_at=excluded.updated_at'; END IF;
 EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1)%s',p_collection,definition.write_columns,definition.write_columns,p_collection,suffix) USING rows_to_write;
 -- An empty-to-empty acknowledged clear also advances the revision. Other
 -- authorized row mutations may advance it more than once; clients treat it opaque.
 UPDATE public.document_collection_revisions SET revision=revision+1
  WHERE user_id=uid AND document_id=p_document_id AND generation=p_generation AND collection=p_collection AND page_key=page RETURNING revision INTO current_revision;
 INSERT INTO public.document_collection_receipts(user_id,write_id,document_id,generation,collection,page_key,expected_revision,payload,revision)
  VALUES(uid,p_write_id,p_document_id,p_generation,p_collection,page,p_expected_revision,p_rows,current_revision);
 RETURN current_revision;
END $$;
REVOKE ALL ON FUNCTION public.replace_study_collection_v2(text,text,uuid,text,bigint,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_study_collection_v2(text,text,uuid,text,bigint,uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.replace_study_collection(p_collection text,p_document_id text,p_page_key text,p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Client upgrade required: generation and collection revision are mandatory' USING ERRCODE='PDU01'; END $$;
REVOKE ALL ON FUNCTION public.replace_study_collection(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
-- Browser writes to replayable collections must carry CAS through the RPC.
-- Definer functions and FK cleanup retain their narrowly authorized paths.
REVOKE INSERT,UPDATE,DELETE ON public.text_notes,public.bookmarks,public.key_terms,
 public.blank_pages,public.flashcards,public.drawings,public.page_image_annotations,
 public.session_state FROM PUBLIC,anon,authenticated;

DO $$ DECLARE target text; columns text; BEGIN
 FOREACH target IN ARRAY ARRAY['text_notes','bookmarks','key_terms','blank_pages','flashcards','drawings','page_image_annotations','session_state'] LOOP
  SELECT string_agg(quote_ident(column_name),',') INTO columns FROM information_schema.columns WHERE table_schema='public' AND table_name=target;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.%I FROM PUBLIC,anon,authenticated',columns,columns,target);
 END LOOP;
END $$;

CREATE FUNCTION public.create_flashcard_deck_v2(p_name text,p_description text,p_document_id text,p_generation uuid,p_cards jsonb,p_expected_owner uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); deck uuid:=gen_random_uuid(); card jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF uid IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Account changed' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_name),'') IS NULL OR jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid deck input' USING ERRCODE='22023'; END IF;
 IF p_document_id IS NOT NULL THEN PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 ELSIF p_generation IS NOT NULL THEN RAISE EXCEPTION 'Standalone deck has no generation' USING ERRCODE='PDD02'; END IF;
 INSERT INTO public.flashcard_decks(id,user_id,name,description,doc_id,document_generation)
 VALUES(deck,uid,btrim(p_name),coalesce(btrim(p_description),''),p_document_id,p_generation);
 FOR card IN SELECT value FROM jsonb_array_elements(p_cards) LOOP
  IF jsonb_typeof(card->'question') IS DISTINCT FROM 'string' OR jsonb_typeof(card->'answer') IS DISTINCT FROM 'string'
   OR nullif(btrim(card->>'question'),'') IS NULL OR nullif(btrim(card->>'answer'),'') IS NULL THEN RAISE EXCEPTION 'Invalid flashcard input' USING ERRCODE='22023'; END IF;
  INSERT INTO public.flashcards(id,user_id,deck_id,doc_id,document_generation,page_num,question,answer)
   VALUES(gen_random_uuid(),uid,deck,coalesce(p_document_id,'deck:'||deck::text),p_generation,0,btrim(card->>'question'),btrim(card->>'answer'));
 END LOOP;
 RETURN deck;
END $$;

CREATE FUNCTION public.review_flashcard_v2(p_card_id uuid,p_expected_review_count integer,p_rating text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); card public.flashcards%ROWTYPE; days integer; reviewed_at timestamptz:=clock_timestamp();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_rating IS NULL OR p_rating NOT IN ('again','hard','good','easy') THEN RAISE EXCEPTION 'Invalid review rating' USING ERRCODE='22023'; END IF;
 -- Parent lock precedes row lock, matching collection replacement/deletion.
 SELECT * INTO card FROM public.flashcards WHERE id=p_card_id AND user_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Flashcard missing or inaccessible' USING ERRCODE='42501'; END IF;
 IF card.document_generation IS NOT NULL THEN PERFORM public.assert_document_generation(card.doc_id,card.document_generation,uid); END IF;
 SELECT * INTO card FROM public.flashcards WHERE id=p_card_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Flashcard missing or inaccessible' USING ERRCODE='42501'; END IF;
 IF p_expected_review_count IS NULL OR card.review_count IS DISTINCT FROM p_expected_review_count THEN RAISE EXCEPTION 'Flashcard review conflict' USING ERRCODE='PDC01'; END IF;
 days:=coalesce(card.interval_days,0);
 days:=CASE p_rating WHEN 'again' THEN 0 WHEN 'hard' THEN greatest(1,round(greatest(days,1)*1.2)::integer)
  WHEN 'good' THEN CASE WHEN days=0 THEN 1 ELSE greatest(2,days*2) END
  ELSE CASE WHEN days=0 THEN 4 ELSE greatest(4,days*3) END END;
 UPDATE public.flashcards SET interval_days=days,review_count=review_count+1,last_reviewed_at=reviewed_at,
  next_review_at=reviewed_at+CASE WHEN p_rating='again' THEN interval '5 minutes' ELSE days*interval '1 day' END
  WHERE id=p_card_id AND user_id=uid RETURNING * INTO card;
 RETURN to_jsonb(card);
END $$;

CREATE FUNCTION public.clear_account_drawings_v2(p_expected_owner uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Account changed' USING ERRCODE='42501'; END IF;
 DELETE FROM public.drawings WHERE user_id=auth.uid();
END $$;

CREATE FUNCTION public.save_document_position_v2(p_document_id text,p_generation uuid,p_virtual_index integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_virtual_index IS NULL OR p_virtual_index<0 THEN RAISE EXCEPTION 'Invalid document position' USING ERRCODE='22023'; END IF;
 PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 INSERT INTO public.session_state(user_id,doc_id,document_generation,virtual_index,updated_at)
 VALUES(uid,p_document_id,p_generation,p_virtual_index,now())
 ON CONFLICT(user_id) DO UPDATE SET doc_id=excluded.doc_id,document_generation=excluded.document_generation,virtual_index=excluded.virtual_index,updated_at=excluded.updated_at;
END $$;
REVOKE ALL ON FUNCTION public.create_flashcard_deck_v2(text,text,text,uuid,jsonb,uuid),public.review_flashcard_v2(uuid,integer,text),public.clear_account_drawings_v2(uuid),public.save_document_position_v2(text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_flashcard_deck_v2(text,text,text,uuid,jsonb,uuid),public.review_flashcard_v2(uuid,integer,text),public.clear_account_drawings_v2(uuid),public.save_document_position_v2(text,uuid,integer) TO authenticated;
COMMIT;
