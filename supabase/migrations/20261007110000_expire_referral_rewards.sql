-- Expire only referral-granted Premium access. Preserve paid subscriptions and VIP/Pro.
CREATE OR REPLACE FUNCTION public.expire_referral_rewards()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_profile record; v_count integer := 0;
BEGIN
  FOR v_profile IN
    SELECT id,plan,is_vip FROM public.profiles
    WHERE referral_expires_at IS NOT NULL AND referral_expires_at <= now()
    ORDER BY id LIMIT 500 FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.profiles SET
      plan=CASE WHEN v_profile.plan='premium' AND NOT coalesce(v_profile.is_vip,false)
        AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id=v_profile.id
          AND s.plan IN ('premium','pro') AND s.status IN ('active','trialing','past_due'))
        THEN 'free' ELSE plan END,
      referral_expires_at=NULL
    WHERE id=v_profile.id;
    v_count := v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_referral_rewards() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_referral_rewards() TO service_role;
