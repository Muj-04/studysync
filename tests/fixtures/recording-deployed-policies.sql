-- Reproduce the observed broad room grants and personal ownership grants.
DROP POLICY fixture_permissive_storage ON storage.objects;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
ALTER TABLE storage.objects ADD COLUMN owner_id text;
CREATE POLICY deployed_room_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='voice-notes' AND (storage.foldername(name))[1]='rooms');
CREATE POLICY deployed_room_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='voice-notes' AND (storage.foldername(name))[1]='rooms');
CREATE POLICY deployed_personal_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='voice-notes' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY deployed_personal_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='voice-notes' AND (storage.foldername(name))[1]=auth.uid()::text);
-- The deployed helper body is unknown. This explicit test stand-in lets tests
-- verify that its independent denial still wins; it is NOT its deployed logic.
CREATE FUNCTION public.allow_launch_upload(bucket_id text,name text,metadata jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('test.launch_upload_denied',true),'false')<>'true'$$;
CREATE POLICY launch_upload_limit ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.allow_launch_upload(bucket_id,name,metadata));
CREATE POLICY deployed_personal_update ON storage.objects FOR UPDATE TO authenticated USING(owner_id=auth.uid()::text OR (storage.foldername(name))[1]=auth.uid()::text) WITH CHECK((owner_id=auth.uid()::text OR (storage.foldername(name))[1]=auth.uid()::text) AND public.allow_launch_upload(bucket_id,name,metadata));
CREATE FUNCTION public.clear_own_recording_metadata() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 DELETE FROM public.voice_notes WHERE user_id=auth.uid();
 DELETE FROM public.room_voice_notes WHERE user_id=auth.uid();
END$$;
GRANT EXECUTE ON FUNCTION public.clear_own_recording_metadata() TO authenticated,service_role;
