BEGIN;
-- A public bucket bypasses authenticated SELECT policies through its public URL.
-- Configure privacy through the Storage API before applying this cutover.
DO $$DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['voice_notes','room_voice_notes'] LOOP
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=target AND column_name='id' AND udt_name='uuid')
  OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=target AND column_name='page_number' AND udt_name IN ('text','varchar')) THEN
   RAISE EXCEPTION 'Recording schema contract requires %.id UUID and page_number TEXT/VARCHAR; reconcile the deployed schema before cutover',target;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='voice-notes' AND public=false) THEN
  RAISE EXCEPTION 'Recording recovery requires an existing private bucket voice-notes';
 END IF;
 IF EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='voice-notes' AND coalesce(to_jsonb(b)->>'versioning_status','DISABLED')<>'DISABLED')
 OR EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='voice-notes' AND (coalesce((to_jsonb(o)->>'is_versioned')::boolean,false) OR coalesce((to_jsonb(o)->>'is_delete_marker')::boolean,false) OR to_jsonb(o)->>'archived_at' IS NOT NULL)) THEN
  RAISE EXCEPTION 'Recording recovery requires a nonversioned bucket without archived versions or delete markers';
 END IF;
END$$;
-- Requires document_generation_guards. Coordinated cutover: old upload clients fail closed.
CREATE SCHEMA IF NOT EXISTS recording_private;
REVOKE ALL ON SCHEMA recording_private FROM PUBLIC, anon, authenticated;
CREATE TABLE recording_private.operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note_id uuid NOT NULL UNIQUE,
 owner_id uuid NOT NULL, scope text NOT NULL CHECK(scope IN ('document','room')), scope_id text NOT NULL,
 document_generation uuid, object_path text UNIQUE, legacy boolean NOT NULL DEFAULT false,
 state text NOT NULL CHECK(state IN ('awaiting_upload','published','deleting','deleted','blocked')),
 mime text NOT NULL, byte_size bigint NOT NULL CHECK(byte_size>=0), page_number text NOT NULL,
 duration numeric NOT NULL, title text, recorded_at timestamptz NOT NULL,
 playback_url text, upload_deadline timestamptz NOT NULL DEFAULT now()+interval '1 hour',
 lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), last_error text
);
ALTER TABLE recording_private.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recording_private.operations FROM PUBLIC,anon,authenticated;
CREATE INDEX recording_operations_ready ON recording_private.operations(next_attempt_at,created_at)
 WHERE state IN ('awaiting_upload','deleting');
ALTER TABLE public.voice_notes ADD COLUMN recording_operation_id uuid REFERENCES recording_private.operations(id);
ALTER TABLE public.room_voice_notes ADD COLUMN recording_operation_id uuid REFERENCES recording_private.operations(id);
CREATE UNIQUE INDEX voice_notes_recording_operation ON public.voice_notes(recording_operation_id);
CREATE UNIQUE INDEX room_voice_notes_recording_operation ON public.room_voice_notes(recording_operation_id);

-- Adopt only conventional paths that belong to this exact row. Unrecognized URLs
-- remain readable but are quarantined; operators must reconcile their objects.
INSERT INTO recording_private.operations(note_id,owner_id,scope,scope_id,document_generation,object_path,legacy,state,mime,byte_size,page_number,duration,title,recorded_at,playback_url)
 SELECT v.id,v.user_id,'document',v.document_id,d.generation,
 CASE WHEN substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$') = ANY(ARRAY[v.user_id||'/'||v.document_id||'/'||v.id||'.webm',v.user_id||'/'||v.document_id||'/'||v.id||'.ogg',v.user_id||'/'||v.document_id||'/'||v.id||'.mp4'])
 THEN substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$') END,
 true,CASE WHEN substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$') = ANY(ARRAY[v.user_id||'/'||v.document_id||'/'||v.id||'.webm',v.user_id||'/'||v.document_id||'/'||v.id||'.ogg',v.user_id||'/'||v.document_id||'/'||v.id||'.mp4']) THEN 'published' ELSE 'blocked' END,
 'audio/webm',coalesce(v.audio_size_bytes,0),v.page_number,coalesce(v.duration,0),v.title,coalesce(v.timestamp,now()),v.audio_url
 FROM public.voice_notes v LEFT JOIN public.documents d ON d.id=v.document_id AND d.user_id=v.user_id;
INSERT INTO recording_private.operations(note_id,owner_id,scope,scope_id,object_path,legacy,state,mime,byte_size,page_number,duration,title,recorded_at,playback_url)
 SELECT v.id,v.user_id,'room',v.room_id::text,
 CASE WHEN substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$') = ANY(ARRAY['rooms/'||v.room_id||'/'||v.id||'.webm','rooms/'||v.room_id||'/'||v.id||'.ogg','rooms/'||v.room_id||'/'||v.id||'.mp4'])
 THEN substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$') END,
 true,CASE WHEN substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$') = ANY(ARRAY['rooms/'||v.room_id||'/'||v.id||'.webm','rooms/'||v.room_id||'/'||v.id||'.ogg','rooms/'||v.room_id||'/'||v.id||'.mp4']) THEN 'published' ELSE 'blocked' END,
 'audio/webm',0,v.page_number,coalesce(v.duration,0),v.title,coalesce(v.timestamp,now()),v.audio_url FROM public.room_voice_notes v;
UPDATE public.voice_notes v SET recording_operation_id=o.id FROM recording_private.operations o WHERE o.note_id=v.id AND o.scope='document';
UPDATE public.room_voice_notes v SET recording_operation_id=o.id FROM recording_private.operations o WHERE o.note_id=v.id AND o.scope='room';

CREATE FUNCTION recording_private.scope_allowed(p_owner uuid,p_scope text,p_scope_id text,p_generation uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_owner FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_scope='document' THEN
  BEGIN PERFORM public.assert_document_generation(p_scope_id,p_generation,p_owner);
  EXCEPTION WHEN SQLSTATE 'PDD01' OR SQLSTATE 'PDD02' OR insufficient_privilege THEN RETURN false; END;
  RETURN true;
 END IF;
 PERFORM 1 FROM public.study_rooms WHERE id=p_scope_id::uuid AND status='active' AND (expires_at IS NULL OR expires_at>now()) FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.room_members WHERE room_id=p_scope_id::uuid AND user_id=p_owner FOR SHARE;
 RETURN FOUND;
END$$;
CREATE FUNCTION recording_private.reply(o recording_private.operations) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'note_id',o.note_id,'state',o.state,'object_path',o.object_path,'audio_url',o.playback_url,'owner_id',o.owner_id,'scope',o.scope,'scope_id',o.scope_id,'document_generation',o.document_generation,'upload_deadline',o.upload_deadline)
$$;
CREATE FUNCTION recording_private.bucket_ready() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='voice-notes' AND NOT b.public AND coalesce(to_jsonb(b)->>'versioning_status','DISABLED')='DISABLED')
$$;

CREATE FUNCTION public.begin_recording_operation(p_note_id uuid,p_scope text,p_scope_id text,p_generation uuid,p_page text,p_duration numeric,p_mime text,p_size bigint,p_title text,p_recorded_at timestamptz,p_expected_owner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations; uid uuid:=auth.uid(); new_id uuid:=gen_random_uuid(); ext text;
BEGIN
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording recovery requires a private nonversioned bucket'; END IF;
 IF uid IS NULL OR uid IS DISTINCT FROM p_expected_owner OR p_scope IS NULL OR p_scope NOT IN ('document','room') OR p_scope_id IS NULL THEN RAISE EXCEPTION 'Recording authorization required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_note_id::text,7802));
 IF NOT recording_private.scope_allowed(uid,p_scope,p_scope_id,p_generation) THEN RAISE EXCEPTION 'Document generation or room authorization is no longer valid' USING ERRCODE='42501'; END IF;
 IF p_note_id IS NULL OR p_size IS NULL OR p_size<1 OR p_size>104857600 OR p_duration IS NULL OR p_duration<0 OR p_duration>86400 OR p_page IS NULL OR length(p_page)>128 OR length(coalesce(p_title,''))>500 OR p_recorded_at IS NULL OR p_mime IS NULL OR p_mime NOT IN ('audio/webm','audio/ogg','audio/mp4') THEN RAISE EXCEPTION 'Invalid recording metadata'; END IF;
 ext:=CASE p_mime WHEN 'audio/ogg' THEN 'ogg' WHEN 'audio/mp4' THEN 'mp4' ELSE 'webm' END;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7801));
 IF NOT EXISTS(SELECT 1 FROM recording_private.operations WHERE note_id=p_note_id) AND (SELECT count(*) FROM recording_private.operations WHERE owner_id=uid AND state='awaiting_upload')>=200 THEN RAISE EXCEPTION 'Too many pending recordings'; END IF;
 INSERT INTO recording_private.operations(id,note_id,owner_id,scope,scope_id,document_generation,object_path,state,mime,byte_size,page_number,duration,title,recorded_at,playback_url)
 VALUES(new_id,p_note_id,uid,p_scope,p_scope_id,p_generation,'operations/'||new_id||'/audio.'||ext,'awaiting_upload',p_mime,p_size,p_page,p_duration,p_title,p_recorded_at,'/api/recordings/'||new_id||'/audio') ON CONFLICT(note_id) DO NOTHING;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE note_id=p_note_id FOR UPDATE;
 IF o.owner_id<>uid OR o.scope<>p_scope OR o.scope_id<>p_scope_id THEN RAISE EXCEPTION 'Recording owner and scope are immutable' USING ERRCODE='42501'; END IF;
 IF o.state IN ('deleting','deleted','blocked') THEN RAISE EXCEPTION 'Recording is deleted or blocked'; END IF;
 IF o.document_generation IS DISTINCT FROM p_generation OR o.mime<>p_mime OR o.byte_size<>p_size OR o.page_number<>p_page THEN RAISE EXCEPTION 'Recording generation and payload are immutable'; END IF;
 RETURN recording_private.reply(o);
END$$;

-- Called by INSERT RLS: lock authorization through Storage metadata commit.
CREATE FUNCTION public.recording_upload_allowed(p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO o FROM recording_private.operations WHERE object_path=p_path;
 IF NOT FOUND OR o.owner_id IS DISTINCT FROM auth.uid() OR o.legacy THEN RETURN false; END IF;
 IF NOT recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation) THEN RETURN false; END IF;
 SELECT * INTO o FROM recording_private.operations WHERE id=o.id FOR UPDATE;
 RETURN o.state='awaiting_upload' AND o.upload_deadline>now();
END$$;
CREATE POLICY recording_upload_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='voice-notes' AND storage.allow_only_operation('object.upload') AND public.recording_upload_allowed(name));
CREATE POLICY recording_upload_must_be_tracked ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'voice-notes' OR (storage.allow_only_operation('object.upload') AND public.recording_upload_allowed(name)));
CREATE POLICY recording_objects_immutable ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'voice-notes') WITH CHECK(bucket_id<>'voice-notes');
CREATE POLICY recording_cleanup_server_only ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'voice-notes');
CREATE POLICY recording_playback_server_only ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'voice-notes' OR name NOT LIKE 'operations/%');

CREATE FUNCTION recording_private.metadata_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'title') IS DISTINCT FROM (to_jsonb(OLD)-'title') THEN RAISE EXCEPTION 'Recording metadata identity is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.recording_operation_id IS NULL THEN RAISE EXCEPTION 'A durable recording operation is required'; END IF;
 SELECT * INTO o FROM recording_private.operations WHERE id=NEW.recording_operation_id FOR UPDATE;
 IF NOT FOUND OR o.state<>'published' OR o.note_id<>NEW.id OR o.owner_id<>NEW.user_id OR o.playback_url IS DISTINCT FROM NEW.audio_url OR o.scope<>(CASE TG_TABLE_NAME WHEN 'voice_notes' THEN 'document' ELSE 'room' END)
 OR o.scope_id IS DISTINCT FROM coalesce(to_jsonb(NEW)->>'document_id',to_jsonb(NEW)->>'room_id') OR (o.scope='document' AND o.document_generation IS DISTINCT FROM (to_jsonb(NEW)->>'document_generation')::uuid) THEN RAISE EXCEPTION 'Recording publication is not authorized'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER recording_metadata_guard BEFORE INSERT OR UPDATE ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_guard();
CREATE TRIGGER recording_metadata_guard BEFORE INSERT OR UPDATE ON public.room_voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_guard();
CREATE FUNCTION recording_private.metadata_deleted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE recording_private.operations SET state=CASE WHEN object_path IS NULL THEN 'blocked' ELSE 'deleting' END,lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE id=OLD.recording_operation_id AND state NOT IN ('deleted','deleting');
 RETURN OLD;
END$$;
CREATE TRIGGER recording_metadata_deleted AFTER DELETE ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_deleted();
CREATE TRIGGER recording_metadata_deleted AFTER DELETE ON public.room_voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_deleted();

CREATE FUNCTION recording_private.publish(p_id uuid,p_owner uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations; allowed boolean; bytes jsonb;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id;
 IF p_owner IS NOT NULL AND o.owner_id<>p_owner THEN RAISE EXCEPTION 'Wrong recording owner' USING ERRCODE='42501'; END IF;
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording publication requires a private nonversioned bucket'; END IF;
 -- Parent/member locks precede the operation lock, as they do during upload.
 allowed:=recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation);
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id FOR UPDATE;
 IF p_lease IS NOT NULL AND (o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<=now()) THEN RAISE EXCEPTION 'Stale recording lease'; END IF;
 IF o.state<>'awaiting_upload' THEN RETURN recording_private.reply(o); END IF;
 IF NOT allowed THEN
  UPDATE recording_private.operations SET state='deleting',lease_token=NULL,lease_until=NULL,next_attempt_at=now() WHERE id=o.id RETURNING * INTO o;
  RETURN recording_private.reply(o);
 END IF;
 SELECT metadata INTO bytes FROM storage.objects WHERE bucket_id='voice-notes' AND name=o.object_path;
 IF NOT FOUND THEN
  -- The deadline limits admission of new bytes, not recovery of committed audio.
  -- A worker outage or metadata failure must never expire an uploaded recording.
  IF o.upload_deadline>now() THEN RAISE EXCEPTION 'Recording bytes have not been uploaded'; END IF;
  UPDATE recording_private.operations SET state='deleting',lease_token=NULL,lease_until=NULL,next_attempt_at=now() WHERE id=o.id RETURNING * INTO o;
  RETURN recording_private.reply(o);
 END IF;
 IF (bytes->'size') IS DISTINCT FROM to_jsonb(o.byte_size) OR coalesce(bytes->>'mimetype','')<>o.mime THEN
  -- Retain uncertain bytes for explicit owner deletion or operator reconciliation.
  UPDATE recording_private.operations SET state='blocked',lease_token=NULL,lease_until=NULL,last_error='Uploaded bytes did not match declared size/type; retained for reconciliation' WHERE id=o.id RETURNING * INTO o;
  RETURN recording_private.reply(o);
 END IF;
 UPDATE recording_private.operations SET state='published',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF o.scope='document' THEN
  INSERT INTO public.voice_notes(id,user_id,document_id,document_generation,page_number,duration,title,audio_url,audio_size_bytes,timestamp,recording_operation_id)
  VALUES(o.note_id,o.owner_id,o.scope_id,o.document_generation,o.page_number,o.duration,o.title,o.playback_url,o.byte_size,o.recorded_at,o.id);
 ELSE
  INSERT INTO public.room_voice_notes(id,user_id,room_id,page_number,duration,title,audio_url,timestamp,recording_operation_id)
  VALUES(o.note_id,o.owner_id,o.scope_id::uuid,o.page_number,o.duration,o.title,o.playback_url,o.recorded_at,o.id);
 END IF;
 RETURN recording_private.reply(o);
END$$;
CREATE FUNCTION public.confirm_recording_upload(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN recording_private.publish(p_id,auth.uid(),NULL);
END$$;
CREATE FUNCTION public.get_recording_operation(p_note_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT recording_private.reply(o) FROM recording_private.operations o WHERE note_id=p_note_id AND owner_id=auth.uid()
$$;
CREATE FUNCTION public.request_recording_deletion(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations; allowed boolean;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id AND owner_id=auth.uid();
 -- Match metadata RLS for published room contributions. Lock membership before
 -- the operation, preserving the same lock order as publication and uploads.
 IF o.scope='room' THEN allowed:=recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation); END IF;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id AND owner_id=auth.uid() FOR UPDATE;
 IF o.scope='room' AND NOT allowed AND EXISTS(SELECT 1 FROM public.room_voice_notes WHERE recording_operation_id=o.id) THEN RAISE EXCEPTION 'Room membership authorization is required' USING ERRCODE='42501'; END IF;
 IF o.state='deleted' THEN RETURN recording_private.reply(o); END IF;
 UPDATE recording_private.operations SET state=CASE WHEN object_path IS NULL THEN 'blocked' ELSE 'deleting' END,lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF o.scope='document' THEN DELETE FROM public.voice_notes WHERE recording_operation_id=o.id;
 ELSE DELETE FROM public.room_voice_notes WHERE recording_operation_id=o.id; END IF;
 RETURN recording_private.reply(o);
END$$;


-- A delete may arrive before a delayed begin on another connection. Serialize by
-- note identity even when no operation row exists, and retain a permanent fence.
CREATE FUNCTION public.delete_recording_identity(p_note_id uuid,p_scope text,p_scope_id text,p_generation uuid,p_expected_owner uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR uid IS DISTINCT FROM p_expected_owner OR p_note_id IS NULL OR p_scope IS NULL OR p_scope NOT IN ('document','room') OR p_scope_id IS NULL THEN RAISE EXCEPTION 'Recording authorization required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_note_id::text,7802));
 SELECT * INTO o FROM recording_private.operations WHERE note_id=p_note_id;
 IF FOUND THEN
  IF o.owner_id<>uid OR o.scope<>p_scope OR o.scope_id<>p_scope_id OR o.document_generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'Recording identity mismatch' USING ERRCODE='42501'; END IF;
  RETURN public.request_recording_deletion(o.id);
 END IF;
 IF NOT recording_private.scope_allowed(uid,p_scope,p_scope_id,p_generation) THEN RAISE EXCEPTION 'Recording scope authorization required' USING ERRCODE='42501'; END IF;
 INSERT INTO recording_private.operations(note_id,owner_id,scope,scope_id,document_generation,state,mime,byte_size,page_number,duration,recorded_at)
 VALUES(p_note_id,uid,p_scope,p_scope_id,p_generation,'deleted','audio/webm',0,'',0,now()) RETURNING * INTO o;
 RETURN recording_private.reply(o);
END$$;
REVOKE ALL ON FUNCTION public.delete_recording_identity(uuid,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_recording_identity(uuid,text,text,uuid,uuid) TO authenticated;

CREATE FUNCTION public.claim_recording_operations(p_limit integer DEFAULT 20) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations;
BEGIN
 FOR o IN SELECT * FROM recording_private.operations x WHERE x.state IN ('awaiting_upload','deleting') AND x.next_attempt_at<=now() AND (x.lease_until IS NULL OR x.lease_until<=now())
 AND (x.state='deleting' OR x.upload_deadline<=now() OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='voice-notes' AND name=x.object_path))
 ORDER BY x.next_attempt_at,x.created_at,x.id LIMIT greatest(1,least(coalesce(p_limit,20),20)) FOR UPDATE SKIP LOCKED LOOP
  UPDATE recording_private.operations SET lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() WHERE id=o.id RETURNING * INTO o;
  RETURN NEXT recording_private.reply(o)||jsonb_build_object('lease_token',o.lease_token);
 END LOOP;
END$$;
CREATE FUNCTION public.publish_claimed_recording(p_id uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF p_lease IS NULL THEN RAISE EXCEPTION 'Recording lease required'; END IF; RETURN recording_private.publish(p_id,NULL,p_lease); END$$;
CREATE FUNCTION public.prepare_recording_cleanup(p_id uuid,p_lease uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id FOR UPDATE;
 IF o.state<>'deleting' OR o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<=now() THEN RAISE EXCEPTION 'Stale recording cleanup lease'; END IF;
 IF o.object_path IS NULL THEN RAISE EXCEPTION 'Unknown recording object path'; END IF;
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording cleanup requires a private nonversioned bucket'; END IF;
 -- Unknown legacy URLs may be aliases/proxies for an adopted object. Refuse to
 -- guess equivalence; operator reconciliation must remove this ambiguity first.
 IF o.legacy AND (EXISTS(SELECT 1 FROM public.voice_notes v JOIN recording_private.operations b ON b.id=v.recording_operation_id WHERE b.legacy AND b.state='blocked')
 OR EXISTS(SELECT 1 FROM public.room_voice_notes v JOIN recording_private.operations b ON b.id=v.recording_operation_id WHERE b.legacy AND b.state='blocked')) THEN RAISE EXCEPTION 'Ambiguous legacy audio references require reconciliation'; END IF;
 IF EXISTS(SELECT 1 FROM public.voice_notes WHERE recording_operation_id=o.id OR audio_url=o.playback_url OR right(split_part(audio_url,'?',1),length('/voice-notes/'||o.object_path))='/voice-notes/'||o.object_path)
 OR EXISTS(SELECT 1 FROM public.room_voice_notes WHERE recording_operation_id=o.id OR audio_url=o.playback_url OR right(split_part(audio_url,'?',1),length('/voice-notes/'||o.object_path))='/voice-notes/'||o.object_path) THEN RAISE EXCEPTION 'Recording audio is still referenced'; END IF;
 RETURN o.object_path;
END$$;
CREATE FUNCTION public.complete_recording_cleanup(p_id uuid,p_lease uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.prepare_recording_cleanup(p_id,p_lease);
 IF EXISTS(SELECT 1 FROM storage.objects s JOIN recording_private.operations o ON o.object_path=s.name WHERE s.bucket_id='voice-notes' AND o.id=p_id) THEN RAISE EXCEPTION 'Recording object removal is not confirmed'; END IF;
 UPDATE recording_private.operations SET state='deleted',lease_token=NULL,lease_until=NULL,updated_at=now(),last_error=NULL WHERE id=p_id;
END$$;
CREATE FUNCTION public.release_recording_lease(p_id uuid,p_lease uuid,p_error text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE recording_private.operations SET lease_token=NULL,lease_until=NULL,last_error=left(p_error,300),next_attempt_at=now()+make_interval(secs=>least(300,5*greatest(1,attempts))),updated_at=now() WHERE id=p_id AND lease_token=p_lease
$$;
CREATE FUNCTION public.recording_playback_path(p_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id AND state='published';
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Playback unauthorized' USING ERRCODE='42501'; END IF;
 IF o.scope='document' THEN
  IF o.owner_id<>auth.uid() OR NOT recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation) THEN RAISE EXCEPTION 'Playback unauthorized' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT recording_private.scope_allowed(auth.uid(),'room',o.scope_id,NULL) THEN RAISE EXCEPTION 'Playback unauthorized' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN o.object_path;
END$$;

-- Explicit grants: clients cannot claim work, release leases, publish as worker,
-- mutate the operation table, or call private implementation functions.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA recording_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.begin_recording_operation(uuid,text,text,uuid,text,numeric,text,bigint,text,timestamptz,uuid),public.recording_upload_allowed(text),public.confirm_recording_upload(uuid),public.get_recording_operation(uuid),public.request_recording_deletion(uuid),public.recording_playback_path(uuid),public.claim_recording_operations(integer),public.publish_claimed_recording(uuid,uuid),public.prepare_recording_cleanup(uuid,uuid),public.complete_recording_cleanup(uuid,uuid),public.release_recording_lease(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_recording_operation(uuid,text,text,uuid,text,numeric,text,bigint,text,timestamptz,uuid),public.recording_upload_allowed(text),public.confirm_recording_upload(uuid),public.get_recording_operation(uuid),public.request_recording_deletion(uuid),public.recording_playback_path(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_recording_operations(integer),public.publish_claimed_recording(uuid,uuid),public.prepare_recording_cleanup(uuid,uuid),public.complete_recording_cleanup(uuid,uuid),public.release_recording_lease(uuid,uuid,text) TO service_role;

-- Bound existing permissive metadata policies at cutover as well.
ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_voice_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY recording_document_read ON public.voice_notes FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY recording_document_read_bound ON public.voice_notes AS RESTRICTIVE FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY recording_document_update ON public.voice_notes FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY recording_document_update_bound ON public.voice_notes AS RESTRICTIVE FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY recording_document_delete ON public.voice_notes FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE POLICY recording_document_delete_bound ON public.voice_notes AS RESTRICTIVE FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.recording_room_member(p_room uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.room_members m JOIN public.study_rooms r ON r.id=m.room_id JOIN auth.users u ON u.id=m.user_id WHERE m.room_id=p_room AND m.user_id=auth.uid() AND r.status='active' AND (r.expires_at IS NULL OR r.expires_at>now()))
$$;
REVOKE ALL ON FUNCTION public.recording_room_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recording_room_member(uuid) TO authenticated;
CREATE POLICY recording_room_read ON public.room_voice_notes FOR SELECT TO authenticated USING(public.recording_room_member(room_id));
CREATE POLICY recording_room_read_bound ON public.room_voice_notes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.recording_room_member(room_id));
CREATE POLICY recording_room_update ON public.room_voice_notes FOR UPDATE TO authenticated USING(user_id=auth.uid() AND public.recording_room_member(room_id)) WITH CHECK(user_id=auth.uid() AND public.recording_room_member(room_id));
CREATE POLICY recording_room_update_bound ON public.room_voice_notes AS RESTRICTIVE FOR UPDATE TO authenticated USING(user_id=auth.uid() AND public.recording_room_member(room_id)) WITH CHECK(user_id=auth.uid() AND public.recording_room_member(room_id));
CREATE POLICY recording_room_delete ON public.room_voice_notes FOR DELETE TO authenticated USING(user_id=auth.uid() AND public.recording_room_member(room_id));
CREATE POLICY recording_room_delete_bound ON public.room_voice_notes AS RESTRICTIVE FOR DELETE TO authenticated USING(user_id=auth.uid() AND public.recording_room_member(room_id));
GRANT SELECT,UPDATE,DELETE ON public.voice_notes,public.room_voice_notes TO authenticated;

CREATE FUNCTION public.rename_recording(p_note_id uuid,p_title text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE note_id=p_note_id AND owner_id=auth.uid();
 IF length(coalesce(p_title,''))>500 THEN RAISE EXCEPTION 'Recording title is too long'; END IF;
 IF NOT recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation) THEN RAISE EXCEPTION 'Recording authorization revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=o.id FOR UPDATE;
 IF o.state NOT IN ('awaiting_upload','published') THEN RAISE EXCEPTION 'Recording is deleted or blocked'; END IF;
 UPDATE recording_private.operations SET title=p_title,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF o.state='published' THEN
  IF o.scope='document' THEN UPDATE public.voice_notes SET title=p_title WHERE recording_operation_id=o.id;
  ELSE UPDATE public.room_voice_notes SET title=p_title WHERE recording_operation_id=o.id; END IF;
 END IF;
 RETURN recording_private.reply(o);
END$$;
REVOKE ALL ON FUNCTION public.rename_recording(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rename_recording(uuid,text) TO authenticated;

-- Read-only cutover inventory. Never infer ownership or delete legacy orphans.
CREATE VIEW recording_private.untracked_audio_inventory AS
 SELECT s.name,s.metadata FROM storage.objects s WHERE s.bucket_id='voice-notes'
 AND NOT EXISTS(SELECT 1 FROM recording_private.operations o WHERE o.object_path=s.name);
REVOKE ALL ON recording_private.untracked_audio_inventory FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA recording_private TO service_role;
GRANT SELECT ON recording_private.untracked_audio_inventory TO service_role;

-- Bound legacy PUBLIC policies and inherited table grants for anonymous callers.
CREATE POLICY recording_anon_storage_insert_bound ON storage.objects AS RESTRICTIVE FOR INSERT TO anon WITH CHECK(bucket_id<>'voice-notes');
CREATE POLICY recording_anon_storage_update_bound ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon USING(bucket_id<>'voice-notes') WITH CHECK(bucket_id<>'voice-notes');
CREATE POLICY recording_anon_storage_delete_bound ON storage.objects AS RESTRICTIVE FOR DELETE TO anon USING(bucket_id<>'voice-notes');
CREATE POLICY recording_anon_storage_read_bound ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'voice-notes' OR name NOT LIKE 'operations/%');
CREATE POLICY recording_anon_document_bound ON public.voice_notes AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE POLICY recording_anon_room_bound ON public.room_voice_notes AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);

-- Storage probes caller RLS in a rolled-back savepoint, then writes metadata as
-- admin. Fence that actual commit too; otherwise revocation can win in the gap.
-- The function lives outside the provider schema. Physical bytes remain managed
-- exclusively by the Storage API, including cleanup after a rejected insert.
CREATE FUNCTION recording_private.storage_commit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o recording_private.operations; live boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.bucket_id='voice-notes' AND (to_jsonb(NEW)-'updated_at'-'last_accessed_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'last_accessed_at') THEN
   RAISE EXCEPTION 'Recording object identity and bytes are immutable';
  END IF;
  IF NEW.bucket_id IS DISTINCT FROM 'voice-notes' OR OLD.bucket_id='voice-notes' THEN RETURN NEW; END IF;
 ELSIF NEW.bucket_id IS DISTINCT FROM 'voice-notes' THEN RETURN NEW;
 END IF;
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording Storage commit requires a private nonversioned bucket'; END IF;
 SELECT * INTO o FROM recording_private.operations WHERE object_path=NEW.name AND NOT legacy;
 IF NOT FOUND THEN RAISE EXCEPTION 'A durable recording operation is required for Storage commit'; END IF;
 -- This is deliberately independent of caller JWT/DB role: the Storage final
 -- write runs as admin. The already-accepted owner and scope are authoritative.
 PERFORM 1 FROM auth.users WHERE id=o.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recording account authorization revoked'; END IF;
 IF o.scope='document' THEN
  PERFORM 1 FROM public.documents WHERE id=o.scope_id AND user_id=o.owner_id AND generation=o.document_generation FOR SHARE;
  live:=FOUND;
 ELSE
  live:=recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,NULL);
 END IF;
 IF NOT live THEN RAISE EXCEPTION 'Recording scope authorization revoked'; END IF;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=o.id FOR UPDATE;
 IF o.state<>'awaiting_upload' OR o.upload_deadline<=now() THEN RAISE EXCEPTION 'Recording operation is cancelled, deleted or expired'; END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION recording_private.storage_commit_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER recording_storage_commit_guard BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION recording_private.storage_commit_guard();

COMMIT;
