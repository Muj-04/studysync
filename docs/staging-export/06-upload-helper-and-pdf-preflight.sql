-- Remaining dependencies exposed by the supplied complete policy predicates.
-- Read-only, no object paths, room IDs or user content. Inspect function source
-- privately for embedded credentials before sharing. Do not apply any changes.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
WITH results AS (
 SELECT 'pdf_bucket' AS section, coalesce(jsonb_agg(jsonb_build_object(
   'public',b.public,'file_size_limit',to_jsonb(b)->>'file_size_limit',
   'versioning_status',to_jsonb(b)->>'versioning_status')), '[]'::jsonb) AS payload
 FROM storage.buckets b WHERE b.id='pdfs'
 UNION ALL
 SELECT 'active_room_paths',jsonb_build_object('rooms',count(*),
   'outside_expected_namespace',count(*) FILTER(WHERE NOT coalesce(
     split_part(pdf_path,'/',1)=host_user_id::text
     AND split_part(pdf_path,'/',2)='rooms'
     AND split_part(pdf_path,'/',3)=id::text
     AND split_part(pdf_path,'/',4)<>'',false)))
 FROM public.study_rooms WHERE status='active' AND (expires_at IS NULL OR expires_at>now())
 UNION ALL
 SELECT 'launch_upload_helper',coalesce(jsonb_agg(jsonb_build_object(
   'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
   'definer',p.prosecdef,'source',left(p.prosrc,8000),
   'truncated',length(p.prosrc)>8000,
   'search_path',(SELECT setting FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%'))), '[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='allow_launch_upload'
) SELECT section,payload FROM results ORDER BY section;
COMMIT;
