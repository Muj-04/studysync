-- Compatibility fix for #41 (server recording operations) on databases that carry the
-- free-launch Storage quota (launch_upload_fits / launch_upload_limit, which are
-- RESTRICTIVE policies). #41 uploads recordings to operations/<id>/audio.<ext>. The
-- launch helper only admitted voice-notes paths prefixed by the caller's user ID or
-- rooms/<member room>, so every tracked recording upload was rejected.
--
-- This keeps every launch safeguard (per-file maximum, per-account cap, upsert
-- ownership, account row lock) and admits an operations/ path only when it names
-- the caller's own non-legacy operation that is still awaiting upload. #41's own
-- recording_upload_allowed() and commit trigger continue to enforce scope.
--
-- No-op where the launch quota helper does not exist.
DO $migration$
BEGIN
  IF to_regprocedure('public.launch_upload_fits(uuid,text,text,jsonb)') IS NULL THEN
    RAISE NOTICE 'launch_upload_fits absent; nothing to reconcile';
    RETURN;
  END IF;

  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.launch_upload_fits(p_user uuid, p_bucket text, p_name text, p_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $body$
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
  IF p_bucket='voice-notes' AND split_part(p_name,'/',1)='operations' THEN
    -- Tracked recording path: must be the caller's own pending, non-legacy operation.
    IF to_regclass('recording_private.operations') IS NULL THEN RETURN false; END IF;
    IF NOT EXISTS(SELECT 1 FROM recording_private.operations o
      WHERE o.object_path=p_name AND o.owner_id=v_uid AND NOT o.legacy
        AND o.state='awaiting_upload') THEN RETURN false; END IF;
  ELSIF p_bucket='voice-notes' AND split_part(p_name,'/',1)='rooms' THEN
    IF NOT EXISTS(SELECT 1 FROM public.room_members rm JOIN public.study_rooms r ON r.id=rm.room_id
      WHERE rm.user_id=v_uid AND rm.room_id::text=split_part(p_name,'/',2)
      AND r.status='active' AND r.expires_at>now()) THEN RETURN false; END IF;
  ELSIF split_part(p_name,'/',1)<>v_uid::text THEN RETURN false;
  END IF;
  -- An upsert cannot take another uploader's object.
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_name
    AND COALESCE(owner_id,'')<>v_uid::text) THEN RETURN false; END IF;
  SELECT COALESCE(sum(COALESCE((metadata->>'size')::bigint,v_max)),0) INTO v_used
    FROM storage.objects WHERE bucket_id=p_bucket AND name<>p_name
    AND (owner_id=v_uid::text OR split_part(name,'/',1)=v_uid::text);
  RETURN v_used+v_size<=v_cap;
END;
$body$
$fn$;
  REVOKE ALL ON FUNCTION public.launch_upload_fits(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
END
$migration$;
