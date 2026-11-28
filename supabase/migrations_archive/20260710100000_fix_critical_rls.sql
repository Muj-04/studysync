-- Phase 1: repair the audited critical RLS policies without changing schemas.

DO $$
DECLARE
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['referrals', 'subscriptions', 'room_drawings']
  LOOP
    FOR v_policy IN
      SELECT policyname
        FROM pg_policies
       WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.referrals FROM anon, authenticated;
GRANT ALL ON TABLE public.referrals TO service_role;

-- The Settings page needs only an aggregate for the signed-in referrer, not
-- direct access to referral identities, IP metadata, or reward state.
CREATE OR REPLACE FUNCTION public.get_my_referral_count()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 0::bigint
    ELSE count(*)::bigint
  END
  FROM public.referrals
  WHERE referrer_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_referral_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_referral_count() TO authenticated;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;

ALTER TABLE public.room_drawings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.room_drawings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.room_drawings TO authenticated;
GRANT ALL ON TABLE public.room_drawings TO service_role;

CREATE POLICY room_drawings_member_select
  ON public.room_drawings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_drawings.room_id
         AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY room_drawings_member_insert
  ON public.room_drawings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_drawings.room_id
         AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY room_drawings_member_update
  ON public.room_drawings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_drawings.room_id
         AND rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_drawings.room_id
         AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY room_drawings_member_delete
  ON public.room_drawings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
       WHERE rm.room_id = room_drawings.room_id
         AND rm.user_id = auth.uid()
    )
  );

