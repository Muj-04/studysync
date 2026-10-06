-- Legacy requests remain distinguishable during rolling deployment: never expire them.
ALTER TABLE public.ai_request_reservations
  ADD COLUMN status text NOT NULL DEFAULT 'legacy' CHECK (status IN ('legacy','pending','completed')),
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes');
CREATE INDEX ai_pending_expiry ON public.ai_request_reservations(user_id,expires_at) WHERE status='pending';

CREATE OR REPLACE FUNCTION public.refund_ai_request(p_reservation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.ai_request_reservations%ROWTYPE;
BEGIN
  DELETE FROM public.ai_request_reservations WHERE id=p_reservation AND status IN ('pending','legacy') RETURNING * INTO v_row;
  IF FOUND THEN
    UPDATE public.ai_usage SET count=greatest(0,count-1) WHERE user_id=v_row.user_id AND month=v_row.month;
  END IF;
END;
$$;

-- Runs before quota admission; can also be invoked periodically by a trusted scheduler.
CREATE FUNCTION public.reconcile_ai_requests(p_user_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row record; v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id FROM public.ai_request_reservations
    WHERE status='pending' AND expires_at <= now() AND (p_user_id IS NULL OR user_id=p_user_id)
    ORDER BY user_id,month,id LIMIT 500 FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.refund_ai_request(v_row.id);
    v_count := v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.reserve_ai_request_v2(p_user_id uuid,p_month text,p_limit integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_limit IS NOT NULL AND p_limit < 0 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
  PERFORM public.reconcile_ai_requests(p_user_id);
  INSERT INTO public.ai_usage(user_id,month,count) VALUES(p_user_id,p_month,0) ON CONFLICT(user_id,month) DO NOTHING;
  UPDATE public.ai_usage SET count=count+1 WHERE user_id=p_user_id AND month=p_month AND (p_limit IS NULL OR count < p_limit);
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.ai_request_reservations(user_id,month,status) VALUES(p_user_id,p_month,'pending') RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.complete_ai_request(p_reservation uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.ai_request_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ai_request_reservations WHERE id=p_reservation FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_row.status='completed' THEN RETURN true; END IF;
  IF v_row.status <> 'pending' OR v_row.expires_at <= now() THEN RETURN false; END IF;
  UPDATE public.ai_request_reservations SET status='completed' WHERE id=p_reservation;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_request_v2(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reconcile_ai_requests(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_ai_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_request_v2(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_requests(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ai_request(uuid) TO service_role;
