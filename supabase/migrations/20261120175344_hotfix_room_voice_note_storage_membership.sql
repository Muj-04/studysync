-- Applied directly to production (mlyvadsznvyurjakovau) on 2026-11-20 as version 20261120175344.
-- Room recordings at rooms/<room_id>/<file> were readable and writable by every
-- signed-in user. Restrict both to current members of that room (uploads also require
-- an active, unexpired room). Policy names are kept so #41's restrictive bounds layer
-- on top unchanged. Stored signed URLs already issued remain valid bearer links.
ALTER POLICY "Authenticated users can read room voice notes" ON storage.objects
  USING (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] = 'rooms'
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.user_id = auth.uid()
        AND rm.room_id::text = (storage.foldername(name))[2]
    )
  );

ALTER POLICY "Authenticated users can upload room voice notes" ON storage.objects
  WITH CHECK (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] = 'rooms'
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      JOIN public.study_rooms r ON r.id = rm.room_id
      WHERE rm.user_id = auth.uid()
        AND rm.room_id::text = (storage.foldername(name))[2]
        AND r.status = 'active'
        AND (r.expires_at IS NULL OR r.expires_at > now())
    )
  );
