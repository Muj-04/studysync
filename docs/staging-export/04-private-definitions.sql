-- Optional code audit, not for posting in chat or a public PR.
-- Inspect privately: function/view bodies can contain hardcoded credentials/URLs.
-- The catalog pack supplies hashes. This block returns one two-row result grid.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT 'functions' AS section,coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
 'arguments',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,p.oid),'[]') AS payload
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind IN ('f','p') AND (n.nspname IN ('public','recording_private')
 OR (n.nspname='storage' AND p.proname='allow_only_operation'))
UNION ALL
SELECT 'views',coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true)) ORDER BY n.nspname,c.relname),'[]')
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','recording_private') AND c.relkind IN ('v','m');
COMMIT;

-- OPTIONAL separate block: ONLY if 01 lists supabase_migrations.schema_migrations.
-- Migration SQL may embed credentials: inspect privately, never paste unredacted.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT coalesce(jsonb_agg(jsonb_build_object('version',to_jsonb(m)->>'version','name',to_jsonb(m)->>'name',
 'stored_statements',to_jsonb(m)->'statements') ORDER BY to_jsonb(m)->>'version'),'[]') AS migration_sql
FROM supabase_migrations.schema_migrations m;
COMMIT;
