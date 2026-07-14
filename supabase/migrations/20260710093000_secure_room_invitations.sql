-- Phase 1: make private-room invitations and joining database-authoritative.

CREATE TABLE IF NOT EXISTS public.room_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  inviter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (room_id, invitee_id),
  CHECK (inviter_id <> invitee_id)
);

CREATE INDEX IF NOT EXISTS room_invitations_invitee_status_idx
  ON public.room_invitations (invitee_id, status, expires_at);

ALTER TABLE public.room_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_invitations_select ON public.room_invitations;
CREATE POLICY room_invitations_select
  ON public.room_invitations
  FOR SELECT TO authenticated
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

REVOKE ALL ON TABLE public.room_invitations FROM anon, authenticated;
GRANT SELECT ON TABLE public.room_invitations TO authenticated;

-- Do not expose private room metadata or PDF storage paths before the room
-- access check. Replace legacy SELECT/ALL policies while preserving the
-- existing host-owned create and management behavior.
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
     FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'study_rooms'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.study_rooms', v_policy.policyname);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS study_rooms_authorized_select ON public.study_rooms;
CREATE POLICY study_rooms_authorized_select
  ON public.study_rooms
  FOR SELECT TO authenticated
  USING (
    host_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = study_rooms.id AND rm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.room_invitations ri
       WHERE ri.room_id = study_rooms.id
         AND ri.invitee_id = auth.uid()
         AND ri.status IN ('pending', 'accepted')
         AND ri.expires_at > now()
    )
  );

DROP POLICY IF EXISTS study_rooms_host_insert ON public.study_rooms;
CREATE POLICY study_rooms_host_insert
  ON public.study_rooms
  FOR INSERT TO authenticated
  WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS study_rooms_host_update ON public.study_rooms;
CREATE POLICY study_rooms_host_update
  ON public.study_rooms
  FOR UPDATE TO authenticated
  USING (host_user_id = auth.uid())
  WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS study_rooms_host_delete ON public.study_rooms;
CREATE POLICY study_rooms_host_delete
  ON public.study_rooms
  FOR DELETE TO authenticated
  USING (host_user_id = auth.uid());

REVOKE ALL ON TABLE public.study_rooms FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.study_rooms TO authenticated;

-- Preserve still-valid invitations sent before this table existed.
INSERT INTO public.room_invitations (
  room_id, inviter_id, invitee_id, status, expires_at, created_at
)
SELECT
  (n.data->>'room_id')::uuid,
  (n.data->>'inviter_id')::uuid,
  n.user_id,
  'pending',
  COALESCE(sr.expires_at, n.created_at + interval '6 hours'),
  n.created_at
FROM public.notifications n
JOIN public.study_rooms sr ON sr.id::text = n.data->>'room_id'
WHERE n.type = 'room_invite'
  AND n.data->>'room_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND n.data->>'inviter_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND sr.status = 'active'
  AND COALESCE(sr.expires_at, now() + interval '1 second') > now()
ON CONFLICT (room_id, invitee_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.invite_to_room(
  p_room_id uuid,
  p_invitee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.study_rooms%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN 'unauthenticated'; END IF;
  IF p_invitee_id IS NULL OR p_invitee_id = v_uid THEN RETURN 'invalid_invitee'; END IF;

  SELECT * INTO v_room
    FROM public.study_rooms
   WHERE id = p_room_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_room.status <> 'active' THEN RETURN 'closed'; END IF;
  IF v_room.expires_at IS NOT NULL AND v_room.expires_at <= now() THEN RETURN 'expired'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_members rm
     WHERE rm.room_id = p_room_id AND rm.user_id = v_uid
  ) THEN
    RETURN 'not_member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
     WHERE f.status = 'accepted'
       AND ((f.requester_id = v_uid AND f.receiver_id = p_invitee_id)
         OR (f.receiver_id = v_uid AND f.requester_id = p_invitee_id))
  ) THEN
    RETURN 'not_friend';
  END IF;

  INSERT INTO public.room_invitations (
    room_id, inviter_id, invitee_id, status, expires_at, accepted_at
  ) VALUES (
    p_room_id, v_uid, p_invitee_id, 'pending',
    COALESCE(v_room.expires_at, now() + interval '6 hours'), NULL
  )
  ON CONFLICT (room_id, invitee_id) DO UPDATE SET
    inviter_id = EXCLUDED.inviter_id,
    status = 'pending',
    expires_at = EXCLUDED.expires_at,
    accepted_at = NULL,
    created_at = now();

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (
    p_invitee_id,
    'room_invite',
    jsonb_build_object(
      'room_id', p_room_id,
      'room_name', v_room.document_name,
      'inviter_id', v_uid,
      'inviter_name', v_profile.username,
      'inviter_avatar', v_profile.avatar_url
    )
  );

  RETURN 'invited';
END;
$$;

REVOKE ALL ON FUNCTION public.invite_to_room(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_to_room(uuid, uuid) TO authenticated;

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
  v_plan text;
  v_is_vip boolean;
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

  SELECT COALESCE(plan, 'free'), COALESCE(is_vip, false)
    INTO v_plan, v_is_vip
    FROM public.profiles
   WHERE id = v_uid;
  IF NOT FOUND OR (NOT v_is_vip AND v_plan = 'free') THEN RETURN 'plan_required'; END IF;

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
  IF v_count >= COALESCE(v_max, 10) THEN RETURN 'full'; END IF;

  INSERT INTO public.room_members (room_id, user_id)
  VALUES (p_room_id, v_uid)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  UPDATE public.room_invitations
     SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
   WHERE room_id = p_room_id AND invitee_id = v_uid;

  RETURN 'joined';
END;
$$;

REVOKE ALL ON FUNCTION public.join_room_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_room_atomic(uuid) TO authenticated;
