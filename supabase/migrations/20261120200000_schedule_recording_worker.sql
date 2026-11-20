-- Runs the recording recovery worker (#41) inside Supabase: pg_cron calls the
-- `recording-worker` Edge Function every minute via pg_net.
--
-- Supabase injects the service-role key into Edge Functions, so no privileged
-- credential is copied into CI, Vercel, or chat. The function also requires an
-- invocation token. The database generates the token, keeps it in a private
-- schema, and checks it through an RPC that only service_role can execute.
--
-- Claims use row locks with SKIP LOCKED plus leases, so overlapping invocations
-- are safe; each pass is bounded to 20 operations and roughly 50 seconds.
-- Enable per environment with:
--   SELECT public.schedule_recording_worker('https://<project-ref>.supabase.co');
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS worker_private;
REVOKE ALL ON SCHEMA worker_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS worker_private.recording_worker_token (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE worker_private.recording_worker_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON worker_private.recording_worker_token FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO worker_private.recording_worker_token(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.recording_worker_token_ok(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(length(p_token) = 64 AND p_token = (SELECT token FROM worker_private.recording_worker_token WHERE id = 1), false)
$$;
REVOKE ALL ON FUNCTION public.recording_worker_token_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recording_worker_token_ok(text) TO service_role;

-- Idempotent scheduler. The base URL is per environment, so it is an argument.
CREATE OR REPLACE FUNCTION public.schedule_recording_worker(p_base_url text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_url text;
BEGIN
  IF p_base_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' THEN
    RAISE EXCEPTION 'Expected https://<project-ref>.supabase.co';
  END IF;
  v_url := p_base_url || '/functions/v1/recording-worker';
  RETURN cron.schedule('studysync-recording-worker', '* * * * *', format($job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json',
        'x-worker-token',(SELECT token FROM worker_private.recording_worker_token WHERE id = 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000)
  $job$, v_url));
END $$;
REVOKE ALL ON FUNCTION public.schedule_recording_worker(text) FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
