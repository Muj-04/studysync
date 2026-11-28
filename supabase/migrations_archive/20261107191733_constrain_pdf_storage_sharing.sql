BEGIN;
-- Public URLs bypass Storage RLS. Do not silently change hosted bucket settings.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='pdfs' AND NOT public) THEN
  RAISE EXCEPTION 'PDF sharing requires an existing private pdfs bucket; reconcile Storage before applying';
 END IF;
END $$;

-- Membership is evaluated against authoritative rows. A room's caller-supplied
-- pdf_path cannot grant access outside the host's exact room upload namespace.
CREATE FUNCTION public.can_read_pdf_object(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid())
 AND (
  (split_part(p_name,'/',1)=auth.uid()::text AND strpos(p_name,'/')>0)
  OR EXISTS(
   SELECT 1 FROM public.study_rooms r
   JOIN public.room_members m ON m.room_id=r.id AND m.user_id=auth.uid()
   WHERE r.pdf_path=p_name AND r.status='active'
    AND (r.expires_at IS NULL OR r.expires_at>now())
    AND split_part(p_name,'/',1)=r.host_user_id::text
    AND split_part(p_name,'/',2)='rooms'
    AND split_part(p_name,'/',3)=r.id::text
    AND split_part(p_name,'/',4)<>''
  )
 )
$$;
REVOKE ALL ON FUNCTION public.can_read_pdf_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_pdf_object(text) TO anon,authenticated,service_role;

-- Replace the confirmed broad permit and bound any other permissive policy.
-- Do not remove launch upload/entitlement policies or unrelated bucket policies.
DROP POLICY IF EXISTS pdfs_rooms_select ON storage.objects;
CREATE POLICY pdf_authorized_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='pdfs' AND public.can_read_pdf_object(name));
CREATE POLICY pdf_read_scope_bound ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
 USING(bucket_id<>'pdfs' OR public.can_read_pdf_object(name));
CREATE POLICY pdf_insert_owner_bound ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
 WITH CHECK(bucket_id<>'pdfs' OR (auth.uid() IS NOT NULL AND split_part(name,'/',1)=auth.uid()::text AND strpos(name,'/')>0));
CREATE POLICY pdf_update_owner_bound ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
 USING(bucket_id<>'pdfs' OR (auth.uid() IS NOT NULL AND split_part(name,'/',1)=auth.uid()::text AND strpos(name,'/')>0))
 WITH CHECK(bucket_id<>'pdfs' OR (auth.uid() IS NOT NULL AND split_part(name,'/',1)=auth.uid()::text AND strpos(name,'/')>0));
CREATE POLICY pdf_delete_owner_bound ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
 USING(bucket_id<>'pdfs' OR (auth.uid() IS NOT NULL AND split_part(name,'/',1)=auth.uid()::text AND strpos(name,'/')>0));

-- TRUNCATE bypasses RLS and document deletion/tombstone row triggers. Revoke
-- independently of the generation rollout so this security fix can ship first.
REVOKE TRUNCATE ON public.documents FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
