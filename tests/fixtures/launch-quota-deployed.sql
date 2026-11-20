-- Deployed free-launch Storage quota as observed on staging (xokiiepdpjvqnpzwmbtb) on
-- 2026-11-20. Its migrations (free_launch_*) are in the hosted ledger but were never
-- committed. launch_upload_limit / launch_update_limit are RESTRICTIVE, so every
-- recording upload must satisfy launch_upload_fits in addition to #41's policies.
-- recording-deployed-policies.sql adds owner_id and a stub allow_launch_upload that
-- always admits uploads; that stub hid the path incompatibility. Replace it with the
-- deployed logic, keeping the suite's test.launch_upload_denied toggle.
ALTER TABLE storage.objects ALTER COLUMN owner_id SET DEFAULT nullif(current_setting('request.jwt.claim.sub',true),'');
INSERT INTO public.profiles(id,plan,is_vip) SELECT id,'free',false FROM auth.users ON CONFLICT DO NOTHING;

CREATE FUNCTION public.launch_upload_fits(p_user uuid, p_bucket text, p_name text, p_metadata jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;
REVOKE ALL ON FUNCTION public.launch_upload_fits(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.allow_launch_upload(bucket_id text, name text, metadata jsonb)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(current_setting('test.launch_upload_denied',true),'false')<>'true'
     AND public.launch_upload_fits(auth.uid(),bucket_id,name,metadata);
$$;
GRANT EXECUTE ON FUNCTION public.allow_launch_upload(text,text,jsonb) TO authenticated;

-- launch_upload_limit (RESTRICTIVE INSERT) already exists in the deployed-policy fixture.
CREATE POLICY launch_update_limit ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((owner_id = (auth.uid())::text) OR (split_part(name, '/', 1) = (auth.uid())::text))
  WITH CHECK (public.allow_launch_upload(bucket_id, name, metadata));
