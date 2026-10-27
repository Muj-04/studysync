-- Search exposes public profile identity, never private auth.users email.
-- Keep the legacy result shape so existing clients remain compatible.
CREATE OR REPLACE FUNCTION public.search_users(search_query text)
RETURNS TABLE(id uuid,username text,email text,avatar_url text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT p.id,coalesce(p.username,p.handle),''::text,p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id<>auth.uid()
    AND nullif(trim(search_query),'') IS NOT NULL
    AND (p.username ILIKE '%'||trim(search_query)||'%'
      OR p.handle ILIKE '%'||trim(search_query)||'%')
  ORDER BY CASE WHEN p.username ILIKE trim(search_query)||'%' THEN 0 ELSE 1 END,
    coalesce(p.username,p.handle),p.id
  LIMIT 15;
$$;
REVOKE ALL ON FUNCTION public.search_users(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;
-- These maintenance endpoints are not browser APIs.
REVOKE ALL ON FUNCTION public.close_expired_rooms() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_expired_rooms() TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO service_role;
