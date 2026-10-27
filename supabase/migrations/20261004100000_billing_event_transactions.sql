-- Service-only transactional entitlement updates and durable event deduplication.
CREATE TABLE IF NOT EXISTS public.billing_events (
  event_id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events FROM anon, authenticated;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_event_created bigint NOT NULL DEFAULT 0;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_plan text;
UPDATE public.subscriptions SET billing_plan = plan WHERE plan IN ('premium','pro') AND billing_plan IS NULL;

CREATE OR REPLACE FUNCTION public.apply_billing_event(
  p_event_id text, p_created bigint, p_user_id uuid, p_plan text,
  p_customer_id text, p_subscription_id text, p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := p_user_id;
  v_existing public.subscriptions%ROWTYPE;
  v_plan text;
BEGIN
  IF p_plan IS NOT NULL AND p_plan NOT IN ('premium','pro') THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  IF v_uid IS NULL THEN
    SELECT user_id INTO v_uid FROM public.subscriptions WHERE stripe_subscription_id = p_subscription_id;
    -- Retry an update delivered before its checkout completion.
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Subscription not registered yet'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('billing:' || v_uid::text, 0));
  IF EXISTS (SELECT 1 FROM public.billing_events WHERE event_id = p_event_id) THEN RETURN; END IF;
  SELECT * INTO v_existing FROM public.subscriptions WHERE user_id = v_uid FOR UPDATE;
  IF v_existing.stripe_event_created > p_created THEN
    INSERT INTO public.billing_events(event_id) VALUES (p_event_id) ON CONFLICT DO NOTHING;
    RETURN;
  END IF;
  IF v_existing.stripe_subscription_id IS NOT NULL AND v_existing.stripe_subscription_id <> p_subscription_id
     AND v_existing.status NOT IN ('canceled','incomplete_expired') THEN
    RAISE EXCEPTION 'Another subscription is already registered';
  END IF;
  -- Cancellation is terminal for a Stripe subscription, including equal-second events.
  IF v_existing.stripe_subscription_id = p_subscription_id AND v_existing.status = 'canceled' AND p_status <> 'canceled' THEN RETURN; END IF;
  v_plan := CASE WHEN p_status IN ('canceled','unpaid','incomplete_expired','paused') THEN 'free'
    ELSE coalesce(p_plan, v_existing.billing_plan, nullif(v_existing.plan, 'free')) END;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'Plan missing'; END IF;
  UPDATE public.profiles SET plan = v_plan WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile missing'; END IF;
  INSERT INTO public.subscriptions(user_id,plan,status,stripe_customer_id,stripe_subscription_id,updated_at,stripe_event_created,billing_plan)
    VALUES(v_uid,v_plan,p_status,p_customer_id,p_subscription_id,now(),p_created,coalesce(p_plan,v_existing.billing_plan))
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,
      stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
      updated_at=excluded.updated_at,stripe_event_created=excluded.stripe_event_created,billing_plan=excluded.billing_plan;
  INSERT INTO public.billing_events(event_id) VALUES(p_event_id);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_billing_event(text,bigint,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_event(text,bigint,uuid,text,text,text,text) TO service_role;
