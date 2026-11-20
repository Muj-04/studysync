-- Exported from staging (xokiiepdpjvqnpzwmbtb) supabase_migrations.schema_migrations, version 20261007122000.
-- Body below this header is byte-identical to the hosted statements (CR removed), md5 1a97ffe1de4f77d47a8271beff164f49.
-- STAGING ONLY: not in supabase/migrations on purpose. Applying to production is a product decision.

-- Supabase Storage remains authoritative for object metadata and upload ownership.
UPDATE storage.buckets SET file_size_limit=10485760 WHERE id='voice-notes'
;
UPDATE storage.buckets SET file_size_limit=20971520 WHERE id='pdfs'
;
CREATE FUNCTION public.launch_upload_fits(p_user uuid,p_bucket text,p_name text,p_metadata jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := p_user;
  v_used bigint;
  v_size bigint;
  v_max bigint;
  v_cap bigint;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  CASE p_bucket
    WHEN 'voice-notes' THEN v_max:=10485760; v_cap:=31457280;
    WHEN 'pdfs' THEN v_max:=20971520; v_cap:=104857600;
    WHEN 'office-files' THEN v_max:=52428800; v_cap:=104857600;
    WHEN 'avatars' THEN v_max:=5242880; v_cap:=10485760;
    ELSE RETURN false;
  END CASE;
  -- Serialize concurrent admissions for the same account. Missing size reserves a full file.
  PERFORM 1 FROM public.profiles WHERE id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_size:=COALESCE((p_metadata->>'size')::bigint,v_max);
  IF v_size<0 OR v_size>v_max THEN RETURN false; END IF;
  IF p_bucket='voice-notes' AND split_part(p_name,'/',1)='rooms' THEN
    IF NOT EXISTS(SELECT 1 FROM public.room_members rm JOIN public.study_rooms r ON r.id=rm.room_id
      WHERE rm.user_id=v_uid AND rm.room_id::text=split_part(p_name,'/',2)
      AND r.status='active' AND r.expires_at>now()) THEN RETURN false; END IF;
  ELSIF split_part(p_name,'/',1)<>v_uid::text THEN RETURN false;
  END IF;
  -- An upsert cannot take another uploader's room recording.
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_name
    AND COALESCE(owner_id,'')<>v_uid::text) THEN RETURN false; END IF;
  SELECT COALESCE(sum(COALESCE((metadata->>'size')::bigint,v_max)),0) INTO v_used
    FROM storage.objects WHERE bucket_id=p_bucket AND name<>p_name
    AND (owner_id=v_uid::text OR split_part(name,'/',1)=v_uid::text);
  RETURN v_used+v_size<=v_cap;
END;
$$
;
REVOKE ALL ON FUNCTION public.launch_upload_fits(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated
;
CREATE FUNCTION public.allow_launch_upload(p_bucket text,p_name text,p_metadata jsonb)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.launch_upload_fits(auth.uid(),p_bucket,p_name,p_metadata);
$$
;
REVOKE ALL ON FUNCTION public.allow_launch_upload(text,text,jsonb) FROM PUBLIC,anon
;
GRANT EXECUTE ON FUNCTION public.allow_launch_upload(text,text,jsonb) TO authenticated
;
CREATE POLICY launch_upload_limit ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(public.allow_launch_upload(bucket_id,name,metadata))
;
CREATE POLICY launch_update_limit ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(owner_id=auth.uid()::text OR split_part(name,'/',1)=auth.uid()::text)
  WITH CHECK(public.allow_launch_upload(bucket_id,name,metadata))
;
-- Storage permission preflights roll back and completion uses an elevated role.
-- Therefore RLS alone cannot serialize aggregate limits. Enforce again at commit,
-- using the uploader identity written by Storage (never client custom metadata).
-- No object metadata is mutated by this trigger; rejected uploads are cleaned up by Storage.
CREATE FUNCTION public.enforce_launch_storage_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.bucket_id NOT IN ('voice-notes','pdfs','office-files','avatars') THEN RETURN NEW; END IF;
  -- Trusted administrative uploads have no end-user owner_id.
  IF NEW.owner_id IS NULL OR NEW.owner_id='' THEN RETURN NEW; END IF;
  IF NOT public.launch_upload_fits(NEW.owner_id::uuid,NEW.bucket_id,NEW.name,NEW.metadata) THEN
    RAISE EXCEPTION 'Storage limit reached or upload is not permitted';
  END IF;
  RETURN NEW;
END;
$$
;
REVOKE ALL ON FUNCTION public.enforce_launch_storage_limit() FROM PUBLIC,anon,authenticated
;
CREATE TRIGGER launch_storage_limit BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.enforce_launch_storage_limit()
;
-- Let uploaders remove their room recordings to recover storage capacity.
CREATE POLICY room_recording_owner_delete ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='voice-notes' AND owner_id=auth.uid()::text)
;
CREATE FUNCTION public.get_recording_storage_bytes()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT COALESCE(sum(COALESCE((metadata->>'size')::bigint,10485760)),0)::bigint
  FROM storage.objects WHERE bucket_id='voice-notes'
  AND (owner_id=auth.uid()::text OR split_part(name,'/',1)=auth.uid()::text);
$$
;
REVOKE ALL ON FUNCTION public.get_recording_storage_bytes() FROM PUBLIC,anon
;
GRANT EXECUTE ON FUNCTION public.get_recording_storage_bytes() TO authenticated
;
