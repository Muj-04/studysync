-- Refuse to hide existing duplicate redemptions: resolve them before applying this index.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_redemption_per_user ON public.referrals(referred_id);

CREATE OR REPLACE FUNCTION public.redeem_referral(p_user_id uuid,p_code text,p_ip_address text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_referrer uuid; v_created timestamptz; v_count integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL) THEN RETURN 'email_unverified'; END IF;
  SELECT id,created_at INTO v_referrer,v_created FROM public.profiles WHERE referral_code=upper(trim(p_code));
  IF v_referrer IS NULL OR v_referrer=p_user_id THEN RETURN 'no_referrer_or_self'; END IF;
  IF v_created > now()-interval '24 hours' THEN RETURN 'referrer_too_new'; END IF;
  -- Lock both accounts in deterministic order. This serializes monthly caps,
  -- repeated redemptions, and reward stacking without reciprocal-referral deadlocks.
  PERFORM 1 FROM public.profiles WHERE id IN (v_referrer,p_user_id) ORDER BY id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'Profile missing'; END IF;
  IF EXISTS(SELECT 1 FROM public.referrals WHERE referred_id=p_user_id) THEN RETURN 'already_referred'; END IF;
  IF p_ip_address IS NOT NULL AND EXISTS(SELECT 1 FROM public.referrals WHERE referrer_id=v_referrer AND ip_address::text=p_ip_address) THEN RETURN 'ip_conflict'; END IF;
  SELECT count(*) INTO v_count FROM public.referrals WHERE referrer_id=v_referrer AND reward_granted
    AND created_at >= (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  IF v_count >= 10 THEN RETURN 'monthly_cap'; END IF;
  INSERT INTO public.referrals(referrer_id,referred_id,reward_granted,ip_address) VALUES(v_referrer,p_user_id,true,p_ip_address);
  UPDATE public.profiles SET
    referral_expires_at=greatest(coalesce(referral_expires_at,now()),now())+interval '7 days',
    plan=CASE WHEN NOT coalesce(is_vip,false) AND coalesce(plan,'free')='free' THEN 'premium' ELSE plan END
    WHERE id IN(v_referrer,p_user_id);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_referral(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_referral(uuid,text,text) TO service_role;
