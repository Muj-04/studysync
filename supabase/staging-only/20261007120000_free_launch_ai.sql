-- Exported from staging (xokiiepdpjvqnpzwmbtb) supabase_migrations.schema_migrations, version 20261007120000.
-- Body below this header is byte-identical to the hosted statements (CR removed), md5 b487f4c20c32f4914d340668bd1bfc32.
-- STAGING ONLY: not in supabase/migrations on purpose. Applying to production is a product decision.

-- Daily user allowance and conservative global provider-attempt ceiling.
-- The old month text key also accepts YYYY-MM-DD; monthly history is retained.
CREATE TABLE public.ai_daily_budget (
  day date PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
)
;
ALTER TABLE public.ai_daily_budget ENABLE ROW LEVEL SECURITY
;
REVOKE ALL ON public.ai_daily_budget FROM PUBLIC, anon, authenticated
;
GRANT ALL ON public.ai_daily_budget TO service_role
;
CREATE FUNCTION public.reserve_free_ai_request(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_attempts integer;
  v_id uuid;
BEGIN
  INSERT INTO public.ai_daily_budget(day) VALUES(v_day) ON CONFLICT DO NOTHING;
  SELECT attempts INTO v_attempts FROM public.ai_daily_budget WHERE day=v_day FOR UPDATE;
  IF v_attempts >= 100 THEN RETURN NULL; END IF;
  v_id := public.reserve_ai_request_v2(p_user_id, to_char(v_day,'YYYY-MM-DD'), 3);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.ai_daily_budget SET attempts=attempts+1 WHERE day=v_day;
  RETURN v_id;
END;
$$
;
REVOKE ALL ON FUNCTION public.reserve_free_ai_request(uuid) FROM PUBLIC,anon,authenticated
;
GRANT EXECUTE ON FUNCTION public.reserve_free_ai_request(uuid) TO service_role
;
-- Global attempts deliberately never refund: failures may already cost provider money.
-- Per-user refunds and five-minute crash recovery retain their existing behavior.
;
