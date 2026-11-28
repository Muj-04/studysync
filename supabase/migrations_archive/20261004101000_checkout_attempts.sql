-- One durable checkout attempt per account, reused across concurrent requests.
CREATE TABLE IF NOT EXISTS public.billing_checkout_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan text NOT NULL CHECK (plan IN ('premium','pro')),
  billing text NOT NULL CHECK (billing IN ('monthly','yearly')),
  email text NOT NULL,
  return_origin text NOT NULL,
  expires_at bigint NOT NULL,
  stripe_session_id text
);
ALTER TABLE public.billing_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_checkout_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_checkout_attempt(p_user_id uuid,p_plan text,p_billing text,p_email text,p_origin text)
RETURNS SETOF public.billing_checkout_attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_attempt public.billing_checkout_attempts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('billing:' || p_user_id::text,0));
  SELECT * INTO v_attempt FROM public.billing_checkout_attempts WHERE user_id=p_user_id FOR UPDATE;
  IF FOUND AND v_attempt.expires_at > extract(epoch FROM now()) THEN
    IF v_attempt.plan <> p_plan OR v_attempt.billing <> p_billing THEN
      RAISE EXCEPTION 'An existing checkout is still open. Complete it or wait for it to expire before changing plans.';
    END IF;
    RETURN NEXT v_attempt; RETURN;
  END IF;
  INSERT INTO public.billing_checkout_attempts(user_id,plan,billing,email,return_origin,expires_at)
    VALUES(p_user_id,p_plan,p_billing,p_email,p_origin,floor(extract(epoch FROM now()))::bigint + 3600)
    ON CONFLICT(user_id) DO UPDATE SET attempt_id=gen_random_uuid(),plan=excluded.plan,billing=excluded.billing,
      email=excluded.email,return_origin=excluded.return_origin,expires_at=excluded.expires_at,stripe_session_id=NULL
    RETURNING * INTO v_attempt;
  RETURN NEXT v_attempt;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_checkout_attempt(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_attempt(uuid,text,text,text,text) TO service_role;
