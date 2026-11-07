-- Final targeted gaps from the compact export: no application rows are read.
-- Inspect results privately before sharing; function/policy SQL may embed secrets.
-- Each distinct predicate appears once, rather than repeated for every policy.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH predicates AS (
 SELECT schemaname||'.'||tablename AS relation,policyname,cmd,roles,permissive,
        qual,with_check FROM pg_policies
 WHERE (schemaname='storage' AND tablename='objects')
    OR (schemaname='public' AND tablename IN ('documents','voice_notes','room_voice_notes'))
), expressions AS (
 SELECT qual AS expression FROM predicates WHERE qual IS NOT NULL
 UNION SELECT with_check FROM predicates WHERE with_check IS NOT NULL
), results AS (
 SELECT 'policies' AS section,jsonb_agg(jsonb_build_object(
  'table',relation,'name',policyname,'command',cmd,'roles',roles,
  'permissive',permissive,'using_md5',md5(qual),'check_md5',md5(with_check))
  ORDER BY relation,policyname) AS payload FROM predicates
 UNION ALL
 SELECT 'unique_predicates',jsonb_agg(jsonb_build_object(
  'md5',md5(expression),'sql',left(expression,4000),
  'truncated',length(expression)>4000) ORDER BY md5(expression)) FROM expressions
 UNION ALL
 SELECT 'legacy_cleanup_function',coalesce(jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definer',p.prosecdef,'search_path',(
    SELECT setting FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%'),
  'source',left(p.prosrc,4000),'truncated',length(p.prosrc)>4000)), '[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='clear_own_recording_metadata'
) SELECT section,payload FROM results ORDER BY section;
COMMIT;
