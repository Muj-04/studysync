-- Run each block only if 01-catalog lists that relation. Missing history is a
-- discrepancy: do not create a table or mark versions as applied.
-- One aggregate result per block prevents UI row limits truncating the ledger.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT coalesce(jsonb_agg(jsonb_build_object('version',to_jsonb(m)->>'version',
 'name',to_jsonb(m)->>'name','checksum',to_jsonb(m)->>'checksum') ORDER BY to_jsonb(m)->>'version'),'[]') AS migration_history
FROM supabase_migrations.schema_migrations m;
COMMIT;

-- Optional separate transaction, only if storage.migrations exists.
-- Storage schema migration history is NOT the deployed Storage service version.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(m)->>'id',
 'name',to_jsonb(m)->>'name','hash',to_jsonb(m)->>'hash') ORDER BY to_jsonb(m)->>'id'),'[]') AS storage_schema_history
FROM storage.migrations m;
COMMIT;
