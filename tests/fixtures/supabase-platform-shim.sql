-- Minimal stand-in for the objects every Supabase project provides
-- (roles, auth, storage, realtime, pg_net, pg_cron), so the baseline
-- migration can be replayed on a plain Postgres in tests.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS cron;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role' $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;

CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, owner uuid, owner_id text, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text,
  owner uuid, owner_id text, metadata jsonb, user_metadata jsonb, version text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), last_accessed_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
CREATE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS
  $$ SELECT reverse(split_part(reverse(name), '.', 1)) $$;
CREATE FUNCTION storage.allow_only_operation(op text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('storage.operation', true), op) = op $$;

CREATE TABLE realtime.messages (
  id uuid DEFAULT gen_random_uuid(), topic text NOT NULL, extension text NOT NULL DEFAULT 'broadcast',
  payload jsonb, event text, private boolean DEFAULT false, inserted_at timestamptz DEFAULT now()
);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT current_setting('realtime.topic', true) $$;

CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
  LANGUAGE sql AS $$ SELECT 0::bigint $$;

CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS
  $$ INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
     ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command RETURNING jobid $$;
CREATE FUNCTION cron.unschedule(job_name text) RETURNS boolean LANGUAGE sql AS
  $$ WITH d AS (DELETE FROM cron.job WHERE jobname = job_name RETURNING 1) SELECT count(*) > 0 FROM d $$;

CREATE PUBLICATION supabase_realtime;

GRANT USAGE ON SCHEMA public, auth, storage, realtime, extensions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects, storage.buckets TO anon, authenticated, service_role;
