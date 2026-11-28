-- AUTHZ-01: plan limits are enforced by the database, not only the browser.
--
-- Values mirror src/lib/planLimits.ts exactly (tests/plan-limits-db.test.cjs
-- fails if they drift). NULL means unlimited.
--
--   * study_rooms: free hosts cannot create rooms; max_members is capped by
--     the host's plan; rooms last at most ROOM_DURATION_HOURS (6).
--   * documents: already enforced by guard_document_lifetime (PDQ01, free = 3).
--   * storage.objects: voice notes + room PDFs share one per-account quota
--     (Free 30 MB, Premium 1 GB, Pro 5 GB, VIP unlimited), checked by a
--     RESTRICTIVE policy at upload preflight and again by a commit trigger,
--     because Storage's final write runs with an elevated role.
--
-- Trusted callers (service role, cron, migrations: no end-user JWT) bypass the
-- room checks so billing and cleanup keep working.

CREATE TABLE public.plan_limits (
  plan text PRIMARY KEY CHECK (plan IN ('free', 'premium', 'pro', 'vip')),
  documents integer CHECK (documents IS NULL OR documents >= 0),
  storage_bytes bigint CHECK (storage_bytes IS NULL OR storage_bytes >= 0),
  ai_requests_per_month integer CHECK (ai_requests_per_month IS NULL OR ai_requests_per_month >= 0),
  ai_requests_per_day integer CHECK (ai_requests_per_day IS NULL OR ai_requests_per_day >= 0),
  can_create_rooms boolean NOT NULL,
  max_room_members integer NOT NULL CHECK (max_room_members >= 0)
);
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plan_limits TO service_role;

INSERT INTO public.plan_limits (plan, documents, storage_bytes, ai_requests_per_month, ai_requests_per_day, can_create_rooms, max_room_members) VALUES
  ('free',    3,    31457280,   15,   5,    false, 0),
  ('premium', NULL, 1073741824, 300,  40,   true,  5),
  ('pro',     NULL, 5368709120, 1000, 100,  true,  20),
  ('vip',     NULL, NULL,       NULL, NULL, true,  20);

CREATE FUNCTION public.effective_plan_limits(p_user uuid)
RETURNS public.plan_limits
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.* FROM public.plan_limits l
  WHERE l.plan = coalesce((
    SELECT CASE WHEN p.is_vip THEN 'vip'
                WHEN p.plan IN ('premium', 'pro') THEN p.plan
                ELSE 'free' END
    FROM public.profiles p WHERE p.id = p_user), 'free')
$$;
REVOKE ALL ON FUNCTION public.effective_plan_limits(uuid) FROM PUBLIC, anon, authenticated;

-- An end user is acting (directly or through an RPC they called).
CREATE FUNCTION public.plan_limits_apply() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(auth.role(), '') IN ('authenticated', 'anon')
$$;
REVOKE ALL ON FUNCTION public.plan_limits_apply() FROM PUBLIC, anon, authenticated;

-- ── Study rooms ─────────────────────────────────────────────────────────────
CREATE FUNCTION public.enforce_room_plan_limits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  l public.plan_limits;
  v_max_end timestamptz;
BEGIN
  IF NOT public.plan_limits_apply() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    l := public.effective_plan_limits(NEW.host_user_id);
    IF NOT l.can_create_rooms THEN
      RAISE EXCEPTION 'A Premium or Pro plan is required to create study rooms'
        USING ERRCODE = 'PLM01', HINT = 'plan_limit:rooms';
    END IF;
    NEW.max_members := least(greatest(coalesce(NEW.max_members, l.max_room_members), 2), l.max_room_members);
    v_max_end := now() + interval '6 hours';
    NEW.expires_at := least(coalesce(NEW.expires_at, v_max_end), v_max_end);
    RETURN NEW;
  END IF;
  -- UPDATE: hosts may close or shrink a room, never grow it past their plan.
  IF NEW.host_user_id IS DISTINCT FROM OLD.host_user_id THEN
    RAISE EXCEPTION 'Room host cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.max_members IS DISTINCT FROM OLD.max_members THEN
    l := public.effective_plan_limits(OLD.host_user_id);
    NEW.max_members := least(greatest(coalesce(NEW.max_members, 2), 2), l.max_room_members);
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    v_max_end := coalesce(OLD.created_at, now()) + interval '6 hours';
    NEW.expires_at := least(coalesce(NEW.expires_at, v_max_end), v_max_end);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_room_plan_limits() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER room_plan_limits BEFORE INSERT OR UPDATE ON public.study_rooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_plan_limits();

-- ── Documents ───────────────────────────────────────────────────────────────
-- Already enforced: guard_document_lifetime() (AFTER INSERT on documents)
-- raises PDQ01 when a non-VIP free account would hold more than 3 documents.
-- tests/plan-limits-db.test.cjs checks it matches PLAN_LIMITS.free.documents.

-- ── Storage quota (voice notes + room PDFs) ────────────────────────────────
-- Bytes an account currently holds in quota buckets. Unknown sizes count as a
-- full file so missing metadata can never be used to slip past the quota.
CREATE FUNCTION public.storage_bytes_used(p_user uuid, p_exclude_bucket text DEFAULT NULL, p_exclude_name text DEFAULT NULL)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(coalesce((o.metadata->>'size')::bigint, coalesce(b.file_size_limit, 104857600))), 0)::bigint
  FROM storage.objects o JOIN storage.buckets b ON b.id = o.bucket_id
  WHERE o.bucket_id IN ('voice-notes', 'pdfs')
    AND (o.owner_id = p_user::text OR split_part(o.name, '/', 1) = p_user::text)
    AND NOT (o.bucket_id IS NOT DISTINCT FROM p_exclude_bucket AND o.name IS NOT DISTINCT FROM p_exclude_name)
$$;
REVOKE ALL ON FUNCTION public.storage_bytes_used(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.storage_upload_fits(p_user uuid, p_bucket text, p_name text, p_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  l public.plan_limits;
  v_file_max bigint;
  v_size bigint;
BEGIN
  IF p_bucket NOT IN ('voice-notes', 'pdfs') THEN RETURN true; END IF;
  IF p_user IS NULL THEN RETURN false; END IF;
  l := public.effective_plan_limits(p_user);
  IF l.storage_bytes IS NULL THEN RETURN true; END IF;
  -- Serialize concurrent admissions for the same account.
  PERFORM 1 FROM public.profiles WHERE id = p_user FOR UPDATE;
  SELECT coalesce(file_size_limit, 104857600) INTO v_file_max FROM storage.buckets WHERE id = p_bucket;
  v_size := (p_metadata->>'size')::bigint;
  -- Tracked recordings declare their size up front; Storage later verifies the bytes match.
  IF v_size IS NULL AND p_bucket = 'voice-notes' AND split_part(p_name, '/', 1) = 'operations' THEN
    SELECT o.byte_size INTO v_size FROM recording_private.operations o
    WHERE o.object_path = p_name AND o.owner_id = p_user AND NOT o.legacy;
  END IF;
  v_size := coalesce(v_size, v_file_max);
  IF v_size < 0 THEN RETURN false; END IF;
  RETURN public.storage_bytes_used(p_user, p_bucket, p_name) + v_size <= l.storage_bytes;
END $$;
REVOKE ALL ON FUNCTION public.storage_upload_fits(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.allow_storage_upload(p_bucket text, p_name text, p_metadata jsonb)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.storage_upload_fits(auth.uid(), p_bucket, p_name, p_metadata)
$$;
REVOKE ALL ON FUNCTION public.allow_storage_upload(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allow_storage_upload(text, text, jsonb) TO authenticated;

DROP POLICY IF EXISTS storage_plan_quota_insert ON storage.objects;
CREATE POLICY storage_plan_quota_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.allow_storage_upload(bucket_id, name, metadata));
DROP POLICY IF EXISTS storage_plan_quota_update ON storage.objects;
CREATE POLICY storage_plan_quota_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (public.allow_storage_upload(bucket_id, name, metadata));

-- Storage completes uploads with an elevated role, so check again at commit
-- using the uploader identity Storage records (owner_id), never client metadata.
CREATE FUNCTION public.enforce_storage_plan_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.bucket_id NOT IN ('voice-notes', 'pdfs') THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NULL OR NEW.owner_id = '' THEN RETURN NEW; END IF; -- trusted administrative upload
  IF TG_OP = 'UPDATE' AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata AND NEW.name = OLD.name THEN RETURN NEW; END IF;
  IF NOT public.storage_upload_fits(NEW.owner_id::uuid, NEW.bucket_id, NEW.name, NEW.metadata) THEN
    RAISE EXCEPTION 'Storage limit reached for this plan'
      USING ERRCODE = 'PLM01', HINT = 'plan_limit:storage';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_storage_plan_quota() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER storage_plan_quota BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_plan_quota();

-- Usage shown in the app (voice notes + room PDFs, same rule as the quota).
CREATE FUNCTION public.get_my_storage_bytes() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN 0 ELSE public.storage_bytes_used(auth.uid()) END
$$;
REVOKE ALL ON FUNCTION public.get_my_storage_bytes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_storage_bytes() TO authenticated;
