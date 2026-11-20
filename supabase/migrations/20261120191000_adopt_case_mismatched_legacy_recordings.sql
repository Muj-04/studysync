-- Runs after 20261028203014_server_recording_operations.
--
-- #41 adopts a legacy recording only when its stored URL path exactly equals the
-- conventional path built from the row's ID. 20261028203000 converts TEXT IDs to UUID,
-- and uuid::text renders lowercase, so a legacy object uploaded under an uppercase ID
-- is quarantined (blocked, object_path NULL) even though its object exists.
--
-- This adopts only rows where all of the following hold:
--   * the stored URL path equals the conventional path, compared case-insensitively;
--   * that exact object exists in the voice-notes bucket;
--   * no other operation already claims the path.
-- object_path is set to the real stored name. Nothing in Storage is renamed or removed.
BEGIN;
WITH candidates AS (
  SELECT o.id AS op_id, s.name AS real_path
  FROM recording_private.operations o
  JOIN storage.objects s
    ON s.bucket_id = 'voice-notes'
   AND s.name = substring(split_part(o.playback_url,'?',1) FROM '/voice-notes/(.*)$')
  WHERE o.legacy AND o.state = 'blocked' AND o.object_path IS NULL
    AND lower(s.name) = ANY (CASE o.scope
      WHEN 'document' THEN ARRAY[
        lower(o.owner_id||'/'||o.scope_id||'/'||o.note_id||'.webm'),
        lower(o.owner_id||'/'||o.scope_id||'/'||o.note_id||'.ogg'),
        lower(o.owner_id||'/'||o.scope_id||'/'||o.note_id||'.mp4')]
      ELSE ARRAY[
        lower('rooms/'||o.scope_id||'/'||o.note_id||'.webm'),
        lower('rooms/'||o.scope_id||'/'||o.note_id||'.ogg'),
        lower('rooms/'||o.scope_id||'/'||o.note_id||'.mp4')]
      END)
    AND NOT EXISTS (SELECT 1 FROM recording_private.operations x WHERE x.object_path = s.name)
)
UPDATE recording_private.operations o
   SET object_path = c.real_path, state = 'published', updated_at = now()
  FROM candidates c
 WHERE o.id = c.op_id;
COMMIT;
