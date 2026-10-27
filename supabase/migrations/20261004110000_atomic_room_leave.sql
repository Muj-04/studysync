-- Service endpoint supplies only the authenticated caller's ID.
CREATE OR REPLACE FUNCTION public.leave_room_atomic(p_room_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_removed integer;
BEGIN
  -- Same row lock used by join_room_atomic: joining cannot race room closure.
  PERFORM 1 FROM public.study_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  IF v_removed = 0 THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id) THEN RETURN false; END IF;
  UPDATE public.study_rooms SET status = 'closed' WHERE id = p_room_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.leave_room_atomic(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room_atomic(uuid,uuid) TO service_role;
