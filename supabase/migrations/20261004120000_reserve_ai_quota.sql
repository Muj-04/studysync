CREATE TABLE IF NOT EXISTS public.ai_request_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_request_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_request_reservations FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.reserve_ai_request(p_user_id uuid,p_month text,p_limit integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_limit IS NOT NULL AND p_limit < 0 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
  INSERT INTO public.ai_usage(user_id,month,count) VALUES(p_user_id,p_month,0) ON CONFLICT(user_id,month) DO NOTHING;
  UPDATE public.ai_usage SET count=count+1 WHERE user_id=p_user_id AND month=p_month AND (p_limit IS NULL OR count < p_limit);
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.ai_request_reservations(user_id,month) VALUES(p_user_id,p_month) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.refund_ai_request(p_reservation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.ai_request_reservations%ROWTYPE;
BEGIN
  DELETE FROM public.ai_request_reservations WHERE id=p_reservation RETURNING * INTO v_row;
  IF FOUND THEN
    UPDATE public.ai_usage SET count=greatest(0,count-1) WHERE user_id=v_row.user_id AND month=v_row.month;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_request(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_request(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_request(uuid) TO service_role;
