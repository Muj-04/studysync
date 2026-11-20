-- Runs after 20261120191000. Resolves the two remaining kinds of quarantined legacy
-- recordings found on production on 2026-11-20. No-op where none exist.
--
-- 1. Mobile recordings saved as .m4a. #41 recognizes only .webm/.ogg/.mp4, so a legacy
--    .m4a stays blocked even when its exact object exists at the conventional path.
--    Such rows are adopted only when the stored URL path equals
--    <owner>/<document>/<note>.m4a (or rooms/<room>/<note>.m4a), compared
--    case-insensitively, that exact object exists, and no other operation claims it.
--    MIME is recorded as audio/mp4. Nothing in Storage changes.
-- 2. Room recordings whose upload never completed (audio_url IS NULL, no object).
--    While referenced, these blocked rows make #41's prepare_recording_cleanup refuse
--    every legacy cleanup ("Ambiguous legacy audio references"). They carry no audio,
--    so the row is copied into reconcile_archive and then removed. The operation stays
--    blocked as a permanent fence.
BEGIN;
WITH candidates AS (
  SELECT o.id AS op_id, s.name AS real_path
  FROM recording_private.operations o
  JOIN storage.objects s
    ON s.bucket_id = 'voice-notes'
   AND s.name = substring(split_part(o.playback_url,'?',1) FROM '/voice-notes/(.*)$')
  WHERE o.legacy AND o.state = 'blocked' AND o.object_path IS NULL
    AND lower(s.name) = CASE o.scope
      WHEN 'document' THEN lower(o.owner_id||'/'||o.scope_id||'/'||o.note_id||'.m4a')
      ELSE lower('rooms/'||o.scope_id||'/'||o.note_id||'.m4a') END
    AND NOT EXISTS (SELECT 1 FROM recording_private.operations x WHERE x.object_path = s.name)
)
UPDATE recording_private.operations o
   SET object_path = c.real_path, state = 'published', mime = 'audio/mp4', updated_at = now()
  FROM candidates c
 WHERE o.id = c.op_id;

CREATE SCHEMA IF NOT EXISTS reconcile_archive;
REVOKE ALL ON SCHEMA reconcile_archive FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS reconcile_archive.document_children_20261120 (
  source_table text NOT NULL,
  row_data jsonb NOT NULL,
  reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE reconcile_archive.document_children_20261120 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reconcile_archive.document_children_20261120 FROM PUBLIC, anon, authenticated;

WITH gone AS (
  DELETE FROM public.room_voice_notes v
   USING recording_private.operations o
   WHERE o.id = v.recording_operation_id
     AND v.audio_url IS NULL AND o.legacy AND o.state = 'blocked' AND o.object_path IS NULL
  RETURNING v.*
)
INSERT INTO reconcile_archive.document_children_20261120(source_table,row_data,reason)
SELECT 'room_voice_notes', to_jsonb(gone.*), 'room recording upload never completed (no audio)'
FROM gone;
COMMIT;
