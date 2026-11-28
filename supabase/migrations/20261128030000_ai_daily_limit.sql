-- AI-01: a daily AI cap next to the monthly one, both read from plan_limits.
--
-- reserve_ai_request_v3 reserves one request atomically: it serializes per
-- account, refunds expired reservations, checks the daily cap (UTC day, live
-- reservations only: refunds delete their row), then takes the monthly slot
-- exactly as v2 does. The reply says which limit was hit so the API can
-- explain it. v2 stays for one release so the previous app build keeps working.

CREATE INDEX IF NOT EXISTS ai_reservations_user_created
  ON public.ai_request_reservations USING btree (user_id, created_at);

CREATE FUNCTION public.reserve_ai_request_v3(p_user_id uuid, p_month text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  l public.plan_limits;
  v_today integer;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Invalid AI reservation request'; END IF;
  l := public.effective_plan_limits(p_user_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-reserve:' || p_user_id::text, 0));
  PERFORM public.reconcile_ai_requests(p_user_id);

  IF l.ai_requests_per_day IS NOT NULL THEN
    SELECT count(*) INTO v_today FROM public.ai_request_reservations
    WHERE user_id = p_user_id AND status IN ('pending', 'completed')
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    IF v_today >= l.ai_requests_per_day THEN
      RETURN jsonb_build_object('reservation', NULL, 'limit', 'daily',
        'daily_limit', l.ai_requests_per_day, 'monthly_limit', l.ai_requests_per_month);
    END IF;
  END IF;

  INSERT INTO public.ai_usage (user_id, month, count) VALUES (p_user_id, p_month, 0)
    ON CONFLICT (user_id, month) DO NOTHING;
  UPDATE public.ai_usage SET count = count + 1
    WHERE user_id = p_user_id AND month = p_month
      AND (l.ai_requests_per_month IS NULL OR count < l.ai_requests_per_month);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reservation', NULL, 'limit', 'monthly',
      'daily_limit', l.ai_requests_per_day, 'monthly_limit', l.ai_requests_per_month);
  END IF;
  INSERT INTO public.ai_request_reservations (user_id, month, status)
    VALUES (p_user_id, p_month, 'pending') RETURNING id INTO v_id;
  RETURN jsonb_build_object('reservation', v_id, 'limit', NULL,
    'daily_limit', l.ai_requests_per_day, 'monthly_limit', l.ai_requests_per_month);
END $$;
REVOKE ALL ON FUNCTION public.reserve_ai_request_v3(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_request_v3(uuid, text) TO service_role;
