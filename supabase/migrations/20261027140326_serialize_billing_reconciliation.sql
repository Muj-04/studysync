-- Service-only leases serialize the provider read AND entitlement commit across instances.
CREATE TABLE public.billing_reconciliation_leases (
  subscription_id text PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.billing_reconciliation_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_reconciliation_leases FROM PUBLIC, anon, authenticated;
ALTER TABLE public.subscriptions ADD COLUMN stripe_subscription_created bigint;

CREATE FUNCTION public.claim_billing_reconciliation(p_subscription_id text, p_event_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_token uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.billing_events WHERE event_id = p_event_id) THEN
    RETURN jsonb_build_object('processed', true);
  END IF;
  INSERT INTO public.billing_reconciliation_leases(subscription_id,token,expires_at)
    VALUES(p_subscription_id,gen_random_uuid(),clock_timestamp()+interval '60 seconds')
    ON CONFLICT(subscription_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
      WHERE billing_reconciliation_leases.expires_at <= clock_timestamp()
    RETURNING token INTO v_token;
  IF v_token IS NULL THEN RAISE EXCEPTION 'Billing reconciliation busy; retry'; END IF;
  RETURN jsonb_build_object('token', v_token);
END;
$$;
CREATE FUNCTION public.release_billing_reconciliation(p_subscription_id text, p_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.billing_reconciliation_leases WHERE subscription_id=p_subscription_id AND token=p_token;
$$;

CREATE OR REPLACE FUNCTION public.commit_billing_reconciliation(
  p_event_id text, p_created bigint, p_user_id uuid, p_plan text,
  p_customer_id text, p_subscription_id text, p_status text, p_token uuid, p_subscription_created bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := p_user_id;
  v_existing public.subscriptions%ROWTYPE;
  v_plan text;
BEGIN
  -- Fence an expired worker even if another request has already retrieved newer state.
  PERFORM 1 FROM public.billing_reconciliation_leases
    WHERE subscription_id = p_subscription_id AND token = p_token AND expires_at > clock_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Billing reconciliation lease lost'; END IF;
  IF p_subscription_created IS NULL OR p_subscription_created < 0 THEN RAISE EXCEPTION 'Subscription creation time missing'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active','trialing','past_due','unpaid','incomplete','incomplete_expired','canceled','paused') THEN
    RAISE EXCEPTION 'Invalid subscription status';
  END IF;
  IF p_plan IS NOT NULL AND p_plan NOT IN ('premium','pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  SELECT user_id INTO v_uid FROM public.subscriptions WHERE stripe_subscription_id = p_subscription_id;
  IF v_uid IS NOT NULL AND p_user_id IS NOT NULL AND v_uid <> p_user_id THEN
    RAISE EXCEPTION 'Subscription owner mismatch';
  END IF;
  v_uid := coalesce(v_uid, p_user_id);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Subscription not registered yet'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing:' || v_uid::text, 0));
  IF EXISTS (SELECT 1 FROM public.billing_events WHERE event_id = p_event_id) THEN RETURN; END IF;
  SELECT * INTO v_existing FROM public.subscriptions WHERE user_id = v_uid FOR UPDATE;
  IF v_existing.stripe_subscription_id IS NOT NULL AND v_existing.stripe_subscription_id <> p_subscription_id THEN
    -- A delayed event for a replaced subscription must never replace the newer one.
    IF v_existing.stripe_subscription_created IS NULL THEN
      RAISE EXCEPTION 'Reconcile existing subscription before replacement';
    END IF;
    IF p_subscription_created < v_existing.stripe_subscription_created THEN
      INSERT INTO public.billing_events(event_id) VALUES (p_event_id) ON CONFLICT DO NOTHING;
      RETURN;
    END IF;
    IF p_subscription_created = v_existing.stripe_subscription_created
       OR v_existing.status NOT IN ('canceled','incomplete_expired') THEN
      RAISE EXCEPTION 'Another subscription is already registered';
    END IF;
  END IF;
  v_plan := CASE WHEN p_status IN ('canceled','unpaid','incomplete','incomplete_expired','paused') THEN 'free'
    ELSE coalesce(p_plan, v_existing.billing_plan, nullif(v_existing.plan, 'free')) END;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'Plan missing'; END IF;
  -- The subscription records its own entitlement; the profile also includes
  -- independently earned referral access until that reward expires.
  UPDATE public.profiles SET plan = CASE
    WHEN v_plan = 'free' AND referral_expires_at > now() THEN 'premium'
    ELSE v_plan END
  WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile missing'; END IF;
  INSERT INTO public.subscriptions(user_id,plan,status,stripe_customer_id,stripe_subscription_id,updated_at,stripe_event_created,billing_plan,stripe_subscription_created)
    VALUES(v_uid,v_plan,p_status,p_customer_id,p_subscription_id,now(),p_created,coalesce(p_plan,v_existing.billing_plan),p_subscription_created)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,
      stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
      updated_at=excluded.updated_at,stripe_event_created=excluded.stripe_event_created,billing_plan=excluded.billing_plan,stripe_subscription_created=excluded.stripe_subscription_created;
  INSERT INTO public.billing_events(event_id) VALUES(p_event_id);
END;
$$;

-- The old snapshot writer must not remain available to old application instances.
REVOKE ALL ON FUNCTION public.apply_billing_event(text,bigint,uuid,text,text,text,text) FROM service_role;
REVOKE ALL ON FUNCTION public.claim_billing_reconciliation(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_billing_reconciliation(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_billing_reconciliation(text,bigint,uuid,text,text,text,text,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_reconciliation(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_billing_reconciliation(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_billing_reconciliation(text,bigint,uuid,text,text,text,text,uuid,bigint) TO service_role;
