-- 1. Room membership privacy.
--    room_members was readable by every signed-in user, which revealed who studies
--    in which room. Restrict reads to rooms the caller may already see: as host, as
--    a member, or as a holder of a live invitation. This matches
--    study_rooms_authorized_select. The helper is SECURITY DEFINER so the policy
--    does not recurse through room_members RLS. Writes are unchanged.
--
-- 2. Legacy recording playback.
--    Recordings made before #41 stored 10-year signed Storage URLs in audio_url, and
--    the app handed those long-lived bearer links to every viewer. Point each adopted
--    legacy recording at the same authenticated playback route new recordings use
--    (/api/recordings/<operation>/audio). That route re-checks ownership or current
--    room membership and issues a 60-second link. Objects and paths are unchanged.
--    Note: a long-lived link copied before this change stays valid until its
--    object moves or the project's JWT secret is rotated. The app no longer
--    distributes those links.
BEGIN;
CREATE OR REPLACE FUNCTION public.can_view_room_members(p_room uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.study_rooms r WHERE r.id = p_room AND r.host_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.room_members m WHERE m.room_id = p_room AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.room_invitations i
               WHERE i.room_id = p_room AND i.invitee_id = auth.uid()
                 AND i.status IN ('pending','accepted') AND i.expires_at > now())
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_room_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_room_members(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can read members" ON public.room_members;
DROP POLICY IF EXISTS members_select ON public.room_members;
CREATE POLICY room_members_visible_to_participants ON public.room_members
  FOR SELECT TO authenticated USING (public.can_view_room_members(room_id));

-- metadata_guard (#41) makes everything except title immutable for API callers.
-- This one-time operator correction runs with it disabled inside this transaction.
ALTER TABLE public.voice_notes DISABLE TRIGGER recording_metadata_guard;
ALTER TABLE public.room_voice_notes DISABLE TRIGGER recording_metadata_guard;

UPDATE recording_private.operations o
   SET playback_url = '/api/recordings/' || o.id || '/audio', updated_at = now()
 WHERE o.legacy AND o.state = 'published'
   AND o.playback_url IS DISTINCT FROM '/api/recordings/' || o.id || '/audio';
UPDATE public.voice_notes v SET audio_url = o.playback_url
  FROM recording_private.operations o
 WHERE o.id = v.recording_operation_id AND o.legacy AND o.state = 'published'
   AND v.audio_url IS DISTINCT FROM o.playback_url;
UPDATE public.room_voice_notes v SET audio_url = o.playback_url
  FROM recording_private.operations o
 WHERE o.id = v.recording_operation_id AND o.legacy AND o.state = 'published'
   AND v.audio_url IS DISTINCT FROM o.playback_url;

ALTER TABLE public.voice_notes ENABLE TRIGGER recording_metadata_guard;
ALTER TABLE public.room_voice_notes ENABLE TRIGGER recording_metadata_guard;
COMMIT;
