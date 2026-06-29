-- Migration: atomic room-join to close the joinRoom() capacity race
--
-- Audit ref:   C-5 (Part 1 §3 — joinRoom capacity check is read-then-write,
--              racey). Two concurrent joiners both observed count=4/max=5
--              and both inserted → 6 members in a 5-cap room. The capacity
--              rule is the only Premium-vs-Pro paywall on room size, so
--              the race is a direct paid-feature bypass.
--
-- Approach:    A SECURITY DEFINER RPC that takes the room id, locks the
--              study_rooms row with SELECT … FOR UPDATE, performs the
--              capacity check under the lock, and inserts on success.
--              Postgres serializes concurrent calls on the same room id
--              (the row lock blocks the second transaction until the
--              first commits), so the second caller sees the updated
--              count and returns 'full' instead of slipping past the cap.
--
-- Return:      Text code consumed by src/lib/supabase/db.ts:joinRoom:
--                'joined'         — new row inserted
--                'rejoined'       — caller was already a member
--                'full'           — capacity reached at lock time
--                'closed'         — study_rooms.status = 'closed'
--                'not_found'      — no such room
--                'unauthenticated'— auth.uid() returned NULL
--
-- Security:    SECURITY DEFINER is required because the function needs
--              to read study_rooms + write room_members under the row
--              lock. auth.uid() still resolves to the calling user, so
--              the inserted row is correctly attributed. EXECUTE is
--              granted only to the `authenticated` role; service_role
--              keeps its native bypass.
--
-- Idempotent:  CREATE OR REPLACE; safe to re-run.

CREATE OR REPLACE FUNCTION public.join_room_atomic(p_room_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
-- Explicit search_path is a SECURITY DEFINER best practice — prevents
-- a malicious search_path entry from rewiring `study_rooms` to another
-- schema for the duration of the call.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid    := auth.uid();
  v_max    int;
  v_status text;
  v_count  int;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  -- Serialise concurrent joins on this room id. NOWAIT would surface
  -- a different error to a parallel call; the default blocking behaviour
  -- is correct here — the second caller waits for the first to commit,
  -- then re-reads the count and either joins (if there's still room) or
  -- returns 'full'.
  SELECT max_members, status
    INTO v_max, v_status
    FROM public.study_rooms
   WHERE id = p_room_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_status = 'closed' THEN
    RETURN 'closed';
  END IF;

  -- Re-join shortcut: existing members never count against capacity.
  -- Matches the prior JS behaviour (db.ts:1138-1140).
  SELECT EXISTS (
    SELECT 1
      FROM public.room_members
     WHERE room_id = p_room_id
       AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    RETURN 'rejoined';
  END IF;

  -- Capacity check under the row lock. COALESCE matches the JS
  -- fallback (max_members IS NULL → 10) for legacy rows.
  SELECT COUNT(*)
    INTO v_count
    FROM public.room_members
   WHERE room_id = p_room_id;

  IF v_count >= COALESCE(v_max, 10) THEN
    RETURN 'full';
  END IF;

  -- ON CONFLICT DO NOTHING is belt-and-suspenders against a race
  -- that's already prevented by the row lock. Cheap insurance.
  INSERT INTO public.room_members (room_id, user_id)
  VALUES (p_room_id, v_uid)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN 'joined';
END;
$$;

REVOKE ALL ON FUNCTION public.join_room_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_room_atomic(uuid) TO authenticated;

COMMENT ON FUNCTION public.join_room_atomic(uuid) IS
  'Atomic room-join: locks study_rooms row, checks capacity under the lock, inserts on success. Closes the read-then-write race in the prior JS joinRoom helper (audit C-5).';
