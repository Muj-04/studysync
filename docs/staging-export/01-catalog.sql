-- Run ONLY in the SQL Editor for project xokiiepdpjvqnpzwmbtb.
-- Catalog only: no application rows or secret/configuration tables queried.
-- Save privately: schema expressions/defaults could contain embedded literals.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '2s';
WITH target AS (
 SELECT c.oid,n.nspname,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.reloptions
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','storage','recording_private','supabase_migrations')
 AND c.relkind IN ('r','p','v','m','S')
), sections AS (
 SELECT 'identity' section,jsonb_build_object('captured_at',now(),'postgres',version(),
 'database',current_database(),'role',current_user,'snapshot_read_only',current_setting('transaction_read_only'),
 'default_transaction_isolation',current_setting('default_transaction_isolation'),
 'project_attestation_required','Confirm dashboard project ref xokiiepdpjvqnpzwmbtb; database name alone does not identify project') payload
 UNION ALL SELECT 'relations',coalesce(jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'kind',relkind,
 'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'options',reloptions) ORDER BY nspname,relname),'[]') FROM target
 UNION ALL SELECT 'columns',coalesce(jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,'column',a.attname,
 'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,
 'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY t.nspname,t.relname,a.attnum),'[]')
 FROM target t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 UNION ALL SELECT 'constraints',coalesce(jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,
 'name',c.conname,'type',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY t.nspname,t.relname,c.conname),'[]')
 FROM target t JOIN pg_constraint c ON c.conrelid=t.oid
 UNION ALL SELECT 'indexes',coalesce(jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,
 'name',ci.relname,'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY t.nspname,t.relname,ci.relname),'[]')
 FROM target t JOIN pg_index i ON i.indrelid=t.oid JOIN pg_class ci ON ci.oid=i.indexrelid
 UNION ALL SELECT 'policies',coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,
 'name',policyname,'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY schemaname,tablename,policyname),'[]')
 FROM pg_policies WHERE schemaname IN ('public','storage','recording_private')
 UNION ALL SELECT 'relation_grants',coalesce(jsonb_agg(jsonb_build_object('schema',t.nspname,'relation',t.relname,
 'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
 'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY t.nspname,t.relname,x.grantee,x.privilege_type),'[]')
 FROM target t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault(CASE WHEN t.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,t.relowner))) x
 UNION ALL SELECT 'column_grants',coalesce(jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,'column',a.attname,
 'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
 'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY t.nspname,t.relname,a.attname,x.grantee),'[]')
 FROM target t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN LATERAL aclexplode(a.attacl) x
 UNION ALL SELECT 'schema_grants',coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,
 'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type) ORDER BY n.nspname,x.grantee,x.privilege_type),'[]')
 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname IN ('public','storage','recording_private')
 UNION ALL SELECT 'default_grants',coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
 'schema',coalesce(n.nspname,'ALL SCHEMAS'),'object_type',d.defaclobjtype,
 'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type) ORDER BY d.oid,x.grantee,x.privilege_type),'[]')
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) x
 WHERE d.defaclnamespace=0 OR n.nspname IN ('public','storage','recording_private')
 UNION ALL SELECT 'functions',coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
 'arguments',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
 'result',pg_get_function_result(p.oid),'definition_md5',md5(pg_get_functiondef(p.oid)),
 'safe_config',(SELECT jsonb_agg(v) FROM unnest(p.proconfig) v WHERE v LIKE 'search_path=%' OR v LIKE 'default_transaction_isolation=%')) ORDER BY n.nspname,p.proname,p.oid),'[]')
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','recording_private','storage') AND p.prokind IN ('f','p')
 UNION ALL SELECT 'function_grants',coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
 'arguments',pg_get_function_identity_arguments(p.oid),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
 'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY n.nspname,p.proname,p.oid,x.grantee),'[]')
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
 WHERE n.nspname IN ('public','recording_private','storage') AND p.prokind IN ('f','p')
 UNION ALL SELECT 'triggers',coalesce(jsonb_agg(jsonb_build_object('schema',t.nspname,'table',t.relname,'name',g.tgname,
 'enabled',g.tgenabled,'definition',pg_get_triggerdef(g.oid,true)) ORDER BY t.nspname,t.relname,g.tgname),'[]')
 FROM target t JOIN pg_trigger g ON g.tgrelid=t.oid WHERE NOT g.tgisinternal
 UNION ALL SELECT 'views',coalesce(jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'definition_md5',md5(pg_get_viewdef(oid,true)),'options',reloptions) ORDER BY nspname,relname),'[]') FROM target WHERE relkind IN ('v','m')
 UNION ALL SELECT 'roles',coalesce(jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypass_rls',rolbypassrls,'can_login',rolcanlogin) ORDER BY rolname),'[]')
 FROM pg_roles
 UNION ALL SELECT 'role_membership',coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),'admin',m.admin_option,
 'inherit_option',to_jsonb(m)->'inherit_option','set_option',to_jsonb(m)->'set_option') ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m
 UNION ALL SELECT 'safe_role_database_settings',coalesce(jsonb_agg(jsonb_build_object('role',CASE WHEN s.setrole=0 THEN 'ALL' ELSE pg_get_userbyid(s.setrole) END,
 'database',CASE WHEN s.setdatabase=0 THEN 'ALL' ELSE d.datname END,'setting',v) ORDER BY s.setrole,s.setdatabase,v),'[]')
 FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase CROSS JOIN LATERAL unnest(s.setconfig) v
 WHERE v LIKE 'default_transaction_isolation=%' OR v LIKE 'pgrst.db_schemas=%' OR v LIKE 'search_path=%'
)
SELECT section,payload FROM sections ORDER BY section;
COMMIT;
