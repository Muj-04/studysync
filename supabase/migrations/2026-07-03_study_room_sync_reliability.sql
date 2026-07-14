-- Make room departure atomic, restrict room-owned writes to members, and
-- use Postgres Changes as the durable fallback for stroke/closure broadcasts.

CREATE OR REPLACE FUNCTION public.leave_room_atomic(p_room_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  DELETE FROM public.room_members
   WHERE room_id = p_room_id
     AND user_id = v_uid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN 'not_member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_members WHERE room_id = p_room_id
  ) THEN
    UPDATE public.study_rooms
       SET status = 'closed'
     WHERE id = p_room_id;
    RETURN 'last';
  END IF;

  RETURN 'left';
END;
$$;

REVOKE ALL ON FUNCTION public.leave_room_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_room_atomic(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can insert room blank pages"
  ON public.room_blank_pages;
CREATE POLICY "Room members can insert room blank pages"
  ON public.room_blank_pages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_blank_pages.room_id
         AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own room voice notes"
  ON public.room_voice_notes;
CREATE POLICY "Room members can insert their own voice notes"
  ON public.room_voice_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_voice_notes.room_id
         AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own room voice notes"
  ON public.room_voice_notes;
CREATE POLICY "Room members can update their own voice notes"
  ON public.room_voice_notes
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_voice_notes.room_id
         AND rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_voice_notes.room_id
         AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own room voice notes"
  ON public.room_voice_notes;
CREATE POLICY "Room members can delete their own voice notes"
  ON public.room_voice_notes
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_voice_notes.room_id
         AND rm.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'room_strokes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_strokes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'study_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_rooms;
  END IF;
END;
$$;
