-- Run only after 01 confirms documents, voice_notes, room_voice_notes,
-- storage.buckets/objects and their required id/owner/reference/audio_url columns.
-- Aggregates only: no user content, IDs, filenames, audio URLs or signed tokens.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
WITH legacy AS (
 SELECT 'document' AS scope,v.audio_url,
 substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$') AS object_path,
 ARRAY[v.user_id||'/'||v.document_id||'/'||v.id||'.webm',v.user_id||'/'||v.document_id||'/'||v.id||'.ogg',v.user_id||'/'||v.document_id||'/'||v.id||'.mp4'] AS expected
 FROM public.voice_notes v
 UNION ALL SELECT 'room',v.audio_url,
 substring(split_part(v.audio_url,'?',1) FROM '/voice-notes/(.*)$'),
 ARRAY['rooms/'||v.room_id||'/'||v.id||'.webm','rooms/'||v.room_id||'/'||v.id||'.ogg','rooms/'||v.room_id||'/'||v.id||'.mp4']
 FROM public.room_voice_notes v
),
children AS (
 SELECT c.table_name,c.column_name,c.is_nullable
 FROM information_schema.columns c JOIN pg_class rel ON rel.oid=format('public.%I',c.table_name)::regclass AND rel.relkind='r'
 WHERE c.table_schema='public' AND c.column_name IN ('document_id','doc_id')
 AND c.table_name NOT IN ('document_lifetimes','document_collection_revisions','document_collection_receipts')
 AND EXISTS(SELECT 1 FROM information_schema.columns u WHERE u.table_schema='public' AND u.table_name=c.table_name AND u.column_name='user_id')
 AND NOT EXISTS(SELECT 1 FROM information_schema.columns r WHERE r.table_schema='public' AND r.table_name=c.table_name AND r.column_name='room_id')
),
sections AS (
 SELECT 'capture' AS section,jsonb_build_object('captured_at',now(),'role',current_user,'read_only',current_setting('transaction_read_only'),'full_row_visibility',(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)) AS payload
 UNION ALL SELECT 'bucket' AS section,coalesce(jsonb_agg(jsonb_build_object('id',id,'public',public,'versioning_status',to_jsonb(b)->>'versioning_status','file_size_limit',to_jsonb(b)->>'file_size_limit','allowed_mime_types',to_jsonb(b)->'allowed_mime_types')),'[]') AS payload FROM storage.buckets b WHERE id='voice-notes'
 UNION ALL SELECT 'object_counts',jsonb_build_object('objects',count(*),'versioned',count(*) FILTER (WHERE coalesce((to_jsonb(o)->>'is_versioned')::boolean,false)),'delete_markers',count(*) FILTER (WHERE coalesce((to_jsonb(o)->>'is_delete_marker')::boolean,false)),'archived',count(*) FILTER (WHERE to_jsonb(o)->>'archived_at' IS NOT NULL)) FROM storage.objects o WHERE bucket_id='voice-notes'
 UNION ALL SELECT 'colliding_note_ids',to_jsonb(count(*)) FROM public.voice_notes v JOIN public.room_voice_notes r ON r.id::text=v.id::text
 UNION ALL SELECT 'legacy_recordings',coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT scope,count(*) AS metadata_rows,
 count(*) FILTER (WHERE audio_url LIKE '%/object/public/%') AS public_urls,
 count(*) FILTER (WHERE audio_url LIKE '%/object/sign/%') AS signed_urls,
 count(*) FILTER (WHERE coalesce(object_path=ANY(expected),false)) AS conventional_paths,
 count(*) FILTER (WHERE NOT coalesce(object_path=ANY(expected),false)) AS ambiguous_paths,
 count(*) FILTER (WHERE object_path=ANY(expected) AND NOT EXISTS (
 SELECT 1 FROM storage.objects o WHERE o.bucket_id='voice-notes' AND o.name=object_path)) AS conventional_paths_without_metadata
FROM legacy GROUP BY scope ORDER BY scope) x
 UNION ALL SELECT 'document_references',coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT table_name,column_name,is_nullable,
 table_name=ANY(ARRAY['text_notes','drawings','bookmarks','key_terms','blank_pages','page_image_annotations','voice_notes','document_tags','document_favorites','study_sessions','community_posts','session_state','flashcard_decks','flashcards']) AS reviewed_table,
 query_to_xml(format('SELECT count(*) AS orphan_foreign_or_generation_mismatch FROM public.%I c WHERE c.%I IS NOT NULL AND NOT (%s) AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id::text=c.%I::text AND d.user_id=c.user_id AND ((to_jsonb(c)->>''document_generation'') IS NULL OR (to_jsonb(c)->>''document_generation'')=(to_jsonb(d)->>''generation'')))',
 table_name,column_name,
 CASE WHEN table_name='flashcards' AND to_regclass('public.flashcard_decks') IS NOT NULL THEN
 'EXISTS(SELECT 1 FROM public.flashcard_decks deck WHERE deck.id::text=to_jsonb(c)->>''deck_id'' AND deck.user_id=c.user_id AND deck.doc_id IS NULL AND c.doc_id=''deck:''||deck.id::text AND to_jsonb(c)->>''document_generation'' IS NULL)'
 ELSE 'false' END,column_name),true,false,'')::text AS counts
FROM children ORDER BY table_name,column_name) x
) SELECT section,payload FROM sections ORDER BY section;
COMMIT;
