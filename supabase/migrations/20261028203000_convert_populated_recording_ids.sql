-- Runs between 20261028202847_document_generation_guards and
-- 20261028203014_server_recording_operations.
--
-- #41 converts TEXT recording IDs to UUID only when the table is empty, and aborts on
-- populated tables. Production holds populated TEXT tables whose IDs are all UUIDs
-- (checked 2026-11-20: 30 voice_notes, 17 room_voice_notes, all UUID-shaped, no
-- cross-table collisions). This step converts them under a lock, but only when every
-- value is a valid UUID, no ID collides across the two tables, and nothing references
-- the column. Otherwise it aborts and changes nothing.
--
-- Values are preserved; uuid::text renders lowercase. Storage paths and audio URLs are
-- not rewritten. 20261120191000 adopts legacy objects whose path differs only by case.
-- Already-UUID tables (staging, fresh databases) make this a no-op.
BEGIN;
LOCK TABLE public.voice_notes, public.room_voice_notes IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE target text; bad bigint;
BEGIN
  FOREACH target IN ARRAY ARRAY['voice_notes','room_voice_notes'] LOOP
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
              AND table_name=target AND column_name='id' AND udt_name='text') THEN
      EXECUTE format($q$SELECT count(*) FROM public.%I
        WHERE id IS NULL OR id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'$q$, target)
        INTO bad;
      IF bad > 0 THEN
        RAISE EXCEPTION 'Recording ID conversion: %.id has % non-UUID value(s); reconcile manually', target, bad;
      END IF;
      EXECUTE format('SELECT count(*) - count(DISTINCT lower(id)) FROM public.%I', target) INTO bad;
      IF bad > 0 THEN
        RAISE EXCEPTION 'Recording ID conversion: %.id has case-insensitive duplicates', target;
      END IF;
      IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=ANY(c.confkey)
                WHERE c.contype='f' AND c.confrelid=format('public.%I',target)::regclass AND a.attname='id') THEN
        RAISE EXCEPTION 'Recording ID conversion: %.id is referenced by a foreign key; reconcile manually', target;
      END IF;
    END IF;
  END LOOP;

  -- #41 adopts both tables into one operations table keyed by note_id.
  IF EXISTS(SELECT 1 FROM public.voice_notes v JOIN public.room_voice_notes r ON lower(r.id::text)=lower(v.id::text)) THEN
    RAISE EXCEPTION 'Recording ID conversion: an ID exists in both voice_notes and room_voice_notes';
  END IF;

  FOREACH target IN ARRAY ARRAY['voice_notes','room_voice_notes'] LOOP
    IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
              AND table_name=target AND column_name='id' AND udt_name='text') THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id TYPE uuid USING id::uuid', target);
    END IF;
  END LOOP;
END $$;
COMMIT;
