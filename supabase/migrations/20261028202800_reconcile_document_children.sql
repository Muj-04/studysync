-- Runs before 20261028202847_document_generation_guards (#40), which aborts when a
-- document-linked row does not belong to an existing document of the same owner.
-- Production on 2026-11-20 had 68 such rows (test accounts only):
--   * study_sessions: 46 rows. 19 point at deleted documents; 27 point at a document
--     ID owned by another account. #40's approved policy for study history is to
--     detach, so document_id is cleared and the session itself is kept.
--   * 22 annotation/recording/favorite rows from one account, keyed to a document ID
--     owned by another account. They cannot stay attached, so every column is
--     copied into reconcile_archive before the live row is removed.
-- Nothing else is changed. Storage objects are untouched; archived voice_notes rows
-- keep their audio_url and the object stays in the bucket.
-- This is a no-op where no such rows exist, e.g. staging or a fresh database.
BEGIN;
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

DO $$
DECLARE child record; ex text; moved bigint;
BEGIN
  FOR child IN
    SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN pg_class rel ON rel.oid=format('public.%I',c.table_name)::regclass AND rel.relkind='r'
    WHERE c.table_schema='public' AND c.column_name IN ('document_id','doc_id')
      AND c.table_name NOT IN ('document_lifetimes','document_collection_revisions','document_collection_receipts')
      AND EXISTS(SELECT 1 FROM information_schema.columns u WHERE u.table_schema='public' AND u.table_name=c.table_name AND u.column_name='user_id')
      AND NOT EXISTS(SELECT 1 FROM information_schema.columns r WHERE r.table_schema='public' AND r.table_name=c.table_name AND r.column_name='room_id')
  LOOP
    ex := 'false';
    IF child.table_name='flashcards' THEN
      ex := 'EXISTS(SELECT 1 FROM public.flashcard_decks deck WHERE deck.id=c.deck_id AND deck.user_id=c.user_id AND deck.doc_id IS NULL AND c.doc_id=''deck:''||deck.id::text)';
    END IF;

    IF child.table_name IN ('study_sessions','community_posts','flashcard_decks','session_state') THEN
      -- Detach policy (same as #40): keep the row, clear only the document link.
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', child.table_name, child.column_name);
      EXECUTE format($q$UPDATE public.%I c SET %I = NULL
        WHERE c.%I IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id::text=c.%I::text AND d.user_id=c.user_id)$q$,
        child.table_name, child.column_name, child.column_name, child.column_name);
      GET DIAGNOSTICS moved = ROW_COUNT;
      IF moved > 0 THEN RAISE NOTICE 'detached % row(s) in %', moved, child.table_name; END IF;
    ELSE
      EXECUTE format($q$WITH gone AS (
          DELETE FROM public.%I c
          WHERE c.%I IS NOT NULL AND NOT (%s)
            AND NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id::text=c.%I::text AND d.user_id=c.user_id)
          RETURNING c.*)
        INSERT INTO reconcile_archive.document_children_20261120(source_table,row_data,reason)
        SELECT %L, to_jsonb(gone.*),
          CASE WHEN EXISTS(SELECT 1 FROM public.documents d WHERE d.id::text=(to_jsonb(gone.*)->>%L))
               THEN 'document owned by another account' ELSE 'document missing' END
        FROM gone$q$,
        child.table_name, child.column_name, ex, child.column_name, child.table_name, child.column_name);
      GET DIAGNOSTICS moved = ROW_COUNT;
      IF moved > 0 THEN RAISE NOTICE 'archived % row(s) from %', moved, child.table_name; END IF;
    END IF;
  END LOOP;
END $$;
COMMIT;
