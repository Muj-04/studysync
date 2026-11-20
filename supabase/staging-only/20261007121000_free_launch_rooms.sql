-- Exported from staging (xokiiepdpjvqnpzwmbtb) supabase_migrations.schema_migrations, version 20261007121000.
-- Body below this header is byte-identical to the hosted statements (CR removed), md5 be6219b8d815effd13e7dff921f353af.
-- STAGING ONLY: not in supabase/migrations on purpose. Applying to production is a product decision.

CREATE OR REPLACE FUNCTION public.join_room_atomic(p_room_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_status text;
  v_host uuid;
  v_expires_at timestamptz;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RETURN 'unauthenticated'; END IF;

  SELECT max_members, status, host_user_id, expires_at
    INTO v_max, v_status, v_host, v_expires_at
    FROM public.study_rooms
   WHERE id = p_room_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status <> 'active' THEN RETURN 'closed'; END IF;
  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN RETURN 'expired'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_members
     WHERE room_id = p_room_id AND user_id = v_uid
  ) THEN
    RETURN 'rejoined';
  END IF;

  IF v_uid <> v_host AND NOT EXISTS (
    SELECT 1 FROM public.room_invitations ri
     WHERE ri.room_id = p_room_id
       AND ri.invitee_id = v_uid
       AND ri.status IN ('pending', 'accepted')
       AND ri.expires_at > now()
  ) THEN
    RETURN 'not_invited';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.room_members
   WHERE room_id = p_room_id;
  IF v_count >= LEAST(COALESCE(v_max, 5), 5) THEN RETURN 'full'; END IF;

  INSERT INTO public.room_members (room_id, user_id)
  VALUES (p_room_id, v_uid)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  UPDATE public.room_invitations
     SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
   WHERE room_id = p_room_id AND invitee_id = v_uid;

  RETURN 'joined';
END;
$$
;
REVOKE ALL ON FUNCTION public.join_room_atomic(uuid) FROM PUBLIC
;
GRANT EXECUTE ON FUNCTION public.join_room_atomic(uuid) TO authenticated
;
-- Membership creation must go through the locked invitation/capacity RPC.
REVOKE INSERT, UPDATE ON public.room_members FROM anon, authenticated
;
CREATE FUNCTION public.enforce_free_room_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.host_user_id IS DISTINCT FROM OLD.host_user_id THEN
    RAISE EXCEPTION 'Room ownership cannot be changed';
  END IF;
  IF NEW.status = 'active' THEN
    PERFORM 1 FROM public.profiles WHERE id=NEW.host_user_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.study_rooms WHERE host_user_id=NEW.host_user_id
      AND id<>NEW.id AND status='active' AND (expires_at IS NULL OR expires_at>now())) THEN
      RAISE EXCEPTION 'Close your existing room before creating another';
    END IF;
    NEW.max_members := LEAST(GREATEST(COALESCE(NEW.max_members,5),2),5);
    NEW.expires_at := LEAST(COALESCE(NEW.expires_at,now()+interval '6 hours'),now()+interval '6 hours');
  END IF;
  RETURN NEW;
END;
$$
;
REVOKE ALL ON FUNCTION public.enforce_free_room_limits() FROM PUBLIC,anon,authenticated
;
CREATE TRIGGER free_room_limits BEFORE INSERT OR UPDATE ON public.study_rooms
FOR EACH ROW EXECUTE FUNCTION public.enforce_free_room_limits()
;
