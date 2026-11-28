-- StudySync baseline schema.
-- Generated 2026-11-28 from production (mlyvadsznvyurjakovau) with scripts/db/schema-snapshot.sql (read-only catalog queries).
-- Recreates every StudySync object: tables, constraints, indexes, functions, views,
-- triggers, RLS policies, grants, storage buckets and policies, realtime publication
-- membership and cron jobs. It contains no row data and no secrets.
--
-- Existing databases (production, staging) already match this file: mark it applied,
-- do not run it. Older history lives in supabase/migrations_archive/.

SET check_function_bodies = off;
SET client_min_messages = warning;


CREATE SCHEMA IF NOT EXISTS reconcile_archive;

CREATE SCHEMA IF NOT EXISTS recording_private;

CREATE SCHEMA IF NOT EXISTS worker_private;

DO $ext$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN undefined_file OR feature_not_supported THEN
  RAISE NOTICE 'pg_cron is not available here (plain Postgres test database)';
END $ext$;

DO $ext$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN undefined_file OR feature_not_supported THEN
  RAISE NOTICE 'pg_net is not available here (plain Postgres test database)';
END $ext$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE SEQUENCE IF NOT EXISTS public.room_strokes_seq_seq AS bigint INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1;

CREATE TABLE public.active_sessions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  device_info text,
  ip_address text,
  last_seen timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.ai_request_reservations (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  month text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  status text NOT NULL,
  expires_at timestamp with time zone NOT NULL
);

CREATE TABLE public.ai_usage (
  user_id uuid NOT NULL,
  month text NOT NULL,
  count integer NOT NULL
);

CREATE TABLE public.billing_checkout_attempts (
  user_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  plan text NOT NULL,
  billing text NOT NULL,
  email text NOT NULL,
  return_origin text NOT NULL,
  expires_at bigint NOT NULL,
  stripe_session_id text
);

CREATE TABLE public.billing_events (
  event_id text NOT NULL,
  processed_at timestamp with time zone NOT NULL
);

CREATE TABLE public.billing_reconciliation_leases (
  subscription_id text NOT NULL,
  token uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL
);

CREATE TABLE public.blank_pages (
  id text NOT NULL,
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  insert_after_page integer NOT NULL,
  canvas_data text,
  bg_theme text,
  created_at bigint NOT NULL,
  images jsonb NOT NULL,
  document_generation uuid
);

CREATE TABLE public.bookmarks (
  id text NOT NULL,
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  virtual_index integer NOT NULL,
  label text NOT NULL,
  created_at timestamp with time zone,
  document_generation uuid
);

CREATE TABLE public.community_posts (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_id text,
  title text NOT NULL,
  description text NOT NULL,
  pages jsonb NOT NULL,
  likes_count integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  tags text[] NOT NULL,
  document_generation uuid
);

CREATE TABLE public.direct_messages (
  id uuid NOT NULL,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL,
  read boolean NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.document_collection_receipts (
  user_id uuid NOT NULL,
  write_id uuid NOT NULL,
  document_id text NOT NULL,
  generation uuid NOT NULL,
  collection text NOT NULL,
  page_key text NOT NULL,
  expected_revision bigint NOT NULL,
  payload jsonb NOT NULL,
  revision bigint NOT NULL
);

CREATE TABLE public.document_collection_revisions (
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  generation uuid NOT NULL,
  collection text NOT NULL,
  page_key text NOT NULL,
  revision bigint NOT NULL
);

CREATE TABLE public.document_favorites (
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  document_generation uuid
);

CREATE TABLE public.document_lifetimes (
  document_id text NOT NULL,
  user_id uuid NOT NULL,
  generation uuid NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE public.document_owner_epochs (
  user_id uuid NOT NULL,
  revision bigint NOT NULL
);

CREATE TABLE public.document_tags (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  tag text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  document_generation uuid
);

CREATE TABLE public.documents (
  id text NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  page_count integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  generation uuid NOT NULL
);

CREATE TABLE public.drawings (
  id text NOT NULL,
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  page_key text NOT NULL,
  canvas_data text,
  updated_at timestamp with time zone,
  document_generation uuid
);

CREATE TABLE public.flashcard_decks (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  doc_id text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  document_generation uuid
);

CREATE TABLE public.flashcards (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  doc_id text NOT NULL,
  page_num integer NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  deck_id uuid,
  next_review_at timestamp with time zone NOT NULL,
  interval_days integer NOT NULL,
  review_count integer NOT NULL,
  last_reviewed_at timestamp with time zone,
  document_generation uuid
);

CREATE TABLE public.follows (
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.friendships (
  id uuid NOT NULL,
  requester_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.key_terms (
  id text NOT NULL,
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  term text NOT NULL,
  definition text NOT NULL,
  created_at timestamp with time zone,
  document_generation uuid
);

CREATE TABLE public.notifications (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  data jsonb NOT NULL,
  read boolean NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_certificates (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  issuer text NOT NULL,
  date_label text NOT NULL,
  credential_id text NOT NULL,
  description text NOT NULL,
  color text NOT NULL,
  file_path text,
  verification_url text,
  sort_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  issued_on date,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_cv_skills (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_education (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  period text NOT NULL,
  institution text NOT NULL,
  degree text NOT NULL,
  note text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE public.office_experiences (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  period text NOT NULL,
  company text NOT NULL,
  role text NOT NULL,
  description text NOT NULL,
  achievements text[] NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE public.office_files (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  node_id uuid,
  project_id uuid,
  name text NOT NULL,
  type_label text NOT NULL,
  mime_type text NOT NULL,
  storage_path text,
  size_bytes bigint NOT NULL,
  display_size text,
  format text NOT NULL,
  favorite boolean NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  note_id uuid,
  certificate_id uuid
);

CREATE TABLE public.office_ideas (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  status text NOT NULL,
  date_label text NOT NULL,
  notes jsonb NOT NULL,
  favorite boolean NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_languages (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  proficiency text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_learning_tracks (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  progress integer NOT NULL,
  target integer NOT NULL,
  sessions integer NOT NULL,
  next_focus text NOT NULL,
  color text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_nodes (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  parent_id uuid,
  kind text NOT NULL,
  name text NOT NULL,
  item_count integer NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_notes (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL,
  content jsonb NOT NULL,
  plain_text text NOT NULL,
  category text NOT NULL,
  favorite boolean NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.office_profiles (
  id uuid NOT NULL,
  name text NOT NULL,
  title text NOT NULL,
  location text NOT NULL,
  email text NOT NULL,
  bio text NOT NULL,
  statement text NOT NULL,
  skills text[] NOT NULL,
  goals text[] NOT NULL,
  availability text NOT NULL,
  current_focus text NOT NULL,
  office_name text NOT NULL,
  week_starts_on text NOT NULL,
  private_by_default boolean NOT NULL,
  avatar_path text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  practice text NOT NULL,
  working_since text NOT NULL
);

CREATE TABLE public.office_projects (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  category text NOT NULL,
  year integer NOT NULL,
  status text NOT NULL,
  description text NOT NULL,
  problem text NOT NULL,
  solution text NOT NULL,
  technologies text[] NOT NULL,
  role text NOT NULL,
  result text NOT NULL,
  tone text NOT NULL,
  demo_url text,
  code_url text,
  featured boolean NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.page_image_annotations (
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  page_number integer NOT NULL,
  images jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  document_generation uuid
);

CREATE TABLE public.post_comments (
  id uuid NOT NULL,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.post_likes (
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text,
  created_at timestamp with time zone,
  avatar_url text,
  plan text NOT NULL,
  is_vip boolean NOT NULL,
  referral_code text,
  referral_expires_at timestamp with time zone,
  handle text NOT NULL
);

CREATE TABLE public.referrals (
  id uuid NOT NULL,
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL,
  reward_granted boolean NOT NULL,
  ip_address text
);

CREATE TABLE public.room_blank_pages (
  id text NOT NULL,
  room_id uuid NOT NULL,
  insert_after_page integer NOT NULL,
  bg_theme text NOT NULL,
  created_at bigint NOT NULL,
  created_by uuid
);

CREATE TABLE public.room_document_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.room_drawings (
  room_id uuid NOT NULL,
  page_number integer NOT NULL,
  data text NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.room_invitations (
  id uuid NOT NULL,
  room_id uuid NOT NULL,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  status text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone
);

CREATE TABLE public.room_members (
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamp with time zone
);

CREATE TABLE public.room_strokes (
  id uuid NOT NULL,
  room_id uuid NOT NULL,
  page_key text NOT NULL,
  user_id uuid NOT NULL,
  seq bigint NOT NULL,
  stroke jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.room_voice_notes (
  id uuid NOT NULL,
  room_id uuid NOT NULL,
  user_id uuid NOT NULL,
  page_number text NOT NULL,
  audio_url text,
  duration double precision NOT NULL,
  title text,
  "timestamp" timestamp with time zone NOT NULL,
  recording_operation_id uuid
);

CREATE TABLE public.session_state (
  user_id uuid NOT NULL,
  doc_id text,
  virtual_index integer,
  updated_at timestamp with time zone,
  document_generation uuid
);

CREATE TABLE public.study_rooms (
  id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  document_name text NOT NULL,
  pdf_path text NOT NULL,
  created_at timestamp with time zone,
  status text NOT NULL,
  max_members integer NOT NULL,
  expires_at timestamp with time zone
);

CREATE TABLE public.study_sessions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_id text,
  started_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  duration_seconds integer,
  document_generation uuid
);

CREATE TABLE public.subscriptions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  plan text NOT NULL,
  status text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  stripe_event_created bigint NOT NULL,
  billing_plan text,
  stripe_subscription_created bigint
);

CREATE TABLE public.text_notes (
  id text NOT NULL,
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  page_key text NOT NULL,
  x numeric NOT NULL,
  y numeric NOT NULL,
  width numeric NOT NULL,
  height numeric NOT NULL,
  content text NOT NULL,
  font_size integer NOT NULL,
  color text NOT NULL,
  created_at timestamp with time zone,
  category text,
  document_generation uuid
);

CREATE TABLE public.user_preferences (
  user_id uuid NOT NULL,
  theme text NOT NULL,
  font_size text NOT NULL,
  accent_color text NOT NULL,
  bg_color text,
  sidebar_color text,
  font_family text NOT NULL,
  view_mode text NOT NULL,
  default_zoom integer NOT NULL,
  default_bg text NOT NULL,
  notif_room_join boolean NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  document_order jsonb
);

CREATE TABLE public.user_settings (
  user_id uuid NOT NULL,
  language text NOT NULL,
  daily_study_goal_hours integer NOT NULL,
  community_visibility text NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.voice_notes (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_id text NOT NULL,
  page_number text NOT NULL,
  duration numeric NOT NULL,
  title text,
  audio_url text,
  "timestamp" timestamp with time zone,
  audio_size_bytes bigint NOT NULL,
  document_generation uuid,
  recording_operation_id uuid
);

CREATE TABLE reconcile_archive.document_children_20261120 (
  source_table text NOT NULL,
  row_data jsonb NOT NULL,
  reason text NOT NULL,
  archived_at timestamp with time zone NOT NULL
);

CREATE TABLE recording_private.operations (
  id uuid NOT NULL,
  note_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  scope text NOT NULL,
  scope_id text NOT NULL,
  document_generation uuid,
  object_path text,
  legacy boolean NOT NULL,
  state text NOT NULL,
  mime text NOT NULL,
  byte_size bigint NOT NULL,
  page_number text NOT NULL,
  duration numeric NOT NULL,
  title text,
  recorded_at timestamp with time zone NOT NULL,
  playback_url text,
  upload_deadline timestamp with time zone NOT NULL,
  lease_token uuid,
  lease_until timestamp with time zone,
  attempts integer NOT NULL,
  next_attempt_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  last_error text
);

CREATE TABLE worker_private.recording_worker_token (
  id integer NOT NULL,
  token text NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE OR REPLACE FUNCTION public.apply_billing_event(p_event_id text, p_created bigint, p_user_id uuid, p_plan text, p_customer_id text, p_subscription_id text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- The subscription records its own entitlement; the profile also includes
  -- independently earned referral access until that reward expires.
  UPDATE public.profiles SET plan = CASE
    WHEN v_plan = 'free' AND referral_expires_at > now() THEN 'premium'
    ELSE v_plan END
  WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile missing'; END IF;
  INSERT INTO public.subscriptions(user_id,plan,status,stripe_customer_id,stripe_subscription_id,updated_at,stripe_event_created,billing_plan)
    VALUES(v_uid,v_plan,p_status,p_customer_id,p_subscription_id,now(),p_created,coalesce(p_plan,v_existing.billing_plan))
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,
      stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
      updated_at=excluded.updated_at,stripe_event_created=excluded.stripe_event_created,billing_plan=excluded.billing_plan;
  INSERT INTO public.billing_events(event_id) VALUES(p_event_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_document_generation(p_document_id text, p_generation uuid, p_owner uuid DEFAULT auth.uid())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE lifetime public.document_lifetimes%ROWTYPE; actual uuid;
BEGIN
 IF p_owner IS NULL OR (coalesce(auth.role(),'')<>'service_role' AND auth.uid() IS DISTINCT FROM p_owner) THEN
  RAISE EXCEPTION 'Document owner authorization required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO lifetime FROM public.document_lifetimes WHERE document_id=p_document_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document missing or deleted' USING ERRCODE='PDD01'; END IF;
 IF lifetime.user_id<>p_owner THEN RAISE EXCEPTION 'Document belongs to another owner' USING ERRCODE='42501'; END IF;
 IF lifetime.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Document permanently deleted' USING ERRCODE='PDD01'; END IF;
 IF p_generation IS NULL OR lifetime.generation<>p_generation THEN RAISE EXCEPTION 'Document generation mismatch' USING ERRCODE='PDD02'; END IF;
 SELECT generation INTO actual FROM public.documents WHERE id::text=p_document_id AND user_id=p_owner FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document missing or deleted' USING ERRCODE='PDD01'; END IF;
 IF actual<>p_generation THEN RAISE EXCEPTION 'Document generation mismatch' USING ERRCODE='PDD02'; END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.begin_recording_operation(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_page text, p_duration numeric, p_mime text, p_size bigint, p_title text, p_recorded_at timestamp with time zone, p_expected_owner uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations; uid uuid:=auth.uid(); new_id uuid:=gen_random_uuid(); ext text;
BEGIN
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording recovery requires a private nonversioned bucket'; END IF;
 IF uid IS NULL OR uid IS DISTINCT FROM p_expected_owner OR p_scope IS NULL OR p_scope NOT IN ('document','room') OR p_scope_id IS NULL THEN RAISE EXCEPTION 'Recording authorization required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_note_id::text,7802));
 IF NOT recording_private.scope_allowed(uid,p_scope,p_scope_id,p_generation) THEN RAISE EXCEPTION 'Document generation or room authorization is no longer valid' USING ERRCODE='42501'; END IF;
 IF p_note_id IS NULL OR p_size IS NULL OR p_size<1 OR p_size>104857600 OR p_duration IS NULL OR p_duration<0 OR p_duration>86400 OR p_page IS NULL OR length(p_page)>128 OR length(coalesce(p_title,''))>500 OR p_recorded_at IS NULL OR p_mime IS NULL OR p_mime NOT IN ('audio/webm','audio/ogg','audio/mp4') THEN RAISE EXCEPTION 'Invalid recording metadata'; END IF;
 -- Respect the deployed bucket without changing hosted Storage configuration.
 -- Existing operations retain their identity/recovery path if limits later change.
 IF NOT EXISTS(SELECT 1 FROM recording_private.operations WHERE note_id=p_note_id) AND EXISTS(
  SELECT 1 FROM storage.buckets b WHERE b.id='voice-notes' AND (
   (to_jsonb(b)->>'file_size_limit' IS NOT NULL AND p_size>(to_jsonb(b)->>'file_size_limit')::bigint)
   OR (jsonb_typeof(to_jsonb(b)->'allowed_mime_types')='array'
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(to_jsonb(b)->'allowed_mime_types') AS allowed(mime)
         WHERE allowed.mime=p_mime OR allowed.mime='*/*' OR allowed.mime=split_part(p_mime,'/',1)||'/*'))
  )
 ) THEN RAISE EXCEPTION 'Recording exceeds bucket size or MIME type limits'; END IF;
 ext:=CASE p_mime WHEN 'audio/ogg' THEN 'ogg' WHEN 'audio/mp4' THEN 'mp4' ELSE 'webm' END;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7801));
 IF NOT EXISTS(SELECT 1 FROM recording_private.operations WHERE note_id=p_note_id) AND (SELECT count(*) FROM recording_private.operations WHERE owner_id=uid AND state='awaiting_upload')>=200 THEN RAISE EXCEPTION 'Too many pending recordings'; END IF;
 INSERT INTO recording_private.operations(id,note_id,owner_id,scope,scope_id,document_generation,object_path,state,mime,byte_size,page_number,duration,title,recorded_at,playback_url)
 VALUES(new_id,p_note_id,uid,p_scope,p_scope_id,p_generation,'operations/'||new_id||'/audio.'||ext,'awaiting_upload',p_mime,p_size,p_page,p_duration,p_title,p_recorded_at,'/api/recordings/'||new_id||'/audio') ON CONFLICT(note_id) DO NOTHING;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE note_id=p_note_id FOR UPDATE;
 IF o.owner_id<>uid OR o.scope<>p_scope OR o.scope_id<>p_scope_id THEN RAISE EXCEPTION 'Recording owner and scope are immutable' USING ERRCODE='42501'; END IF;
 IF o.state IN ('deleting','deleted','blocked') THEN RAISE EXCEPTION 'Recording is deleted or blocked'; END IF;
 IF o.document_generation IS DISTINCT FROM p_generation OR o.mime<>p_mime OR o.byte_size<>p_size OR o.page_number<>p_page THEN RAISE EXCEPTION 'Recording generation and payload are immutable'; END IF;
 RETURN recording_private.reply(o);
END$function$
;

CREATE OR REPLACE FUNCTION public.bump_document_collection_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE row_data jsonb; previous_scope jsonb; current_scope jsonb; scope jsonb;
BEGIN
 IF TG_TABLE_NAME NOT IN ('text_notes','bookmarks','key_terms','blank_pages','flashcards','drawings','page_image_annotations','session_state') THEN RETURN NULL; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(CASE TG_OP WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW)) WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD)) ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
  IF row_data->>'document_generation' IS NULL OR row_data->>TG_ARGV[0] IS NULL THEN CONTINUE; END IF;
  -- Parent deletion purges receipts/revisions before cascading children.
  IF EXISTS(SELECT 1 FROM public.document_lifetimes WHERE document_id=row_data->>TG_ARGV[0] AND deleted_at IS NOT NULL) THEN CONTINUE; END IF;
  current_scope:=jsonb_build_object('owner',row_data->>'user_id','doc',row_data->>TG_ARGV[0],'gen',row_data->>'document_generation','page',
   CASE TG_TABLE_NAME WHEN 'text_notes' THEN row_data->>'page_key' WHEN 'drawings' THEN row_data->>'page_key' WHEN 'flashcards' THEN row_data->>'page_num' WHEN 'page_image_annotations' THEN row_data->>'page_number' ELSE '' END);
  IF current_scope=previous_scope THEN CONTINUE; END IF;
  previous_scope:=current_scope; scope:=current_scope;
  INSERT INTO public.document_collection_revisions(user_id,document_id,generation,collection,page_key,revision)
   VALUES((scope->>'owner')::uuid,scope->>'doc',(scope->>'gen')::uuid,TG_TABLE_NAME,coalesce(scope->>'page',''),1)
   ON CONFLICT(user_id,document_id,generation,collection,page_key) DO UPDATE SET revision=document_collection_revisions.revision+1;
 END LOOP;
 RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.can_read_pdf_object(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT auth.uid() IS NOT NULL
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid())
 AND (
  (split_part(p_name,'/',1)=auth.uid()::text AND strpos(p_name,'/')>0)
  OR EXISTS(
   SELECT 1 FROM public.study_rooms r
   JOIN public.room_members m ON m.room_id=r.id AND m.user_id=auth.uid()
   WHERE r.pdf_path=p_name AND r.status='active'
    AND (r.expires_at IS NULL OR r.expires_at>now())
    AND split_part(p_name,'/',1)=r.host_user_id::text
    AND split_part(p_name,'/',2)='rooms'
    AND split_part(p_name,'/',3)=r.id::text
    AND split_part(p_name,'/',4)<>''
  )
 )
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_community_author(p_author uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    p_author = auth.uid()
    OR CASE coalesce((SELECT s.community_visibility FROM public.user_settings s WHERE s.user_id = p_author), 'everyone')
      WHEN 'everyone' THEN true
      WHEN 'friends' THEN EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = auth.uid() AND f.receiver_id = p_author)
            OR (f.receiver_id = auth.uid() AND f.requester_id = p_author)))
      ELSE false
    END)
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_room_members(p_room uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.study_rooms r WHERE r.id = p_room AND r.host_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.room_members m WHERE m.room_id = p_room AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.room_invitations i
               WHERE i.room_id = p_room AND i.invitee_id = auth.uid()
                 AND i.status IN ('pending','accepted') AND i.expires_at > now())
  )
$function$
;

CREATE OR REPLACE FUNCTION public.claim_billing_reconciliation(p_subscription_id text, p_event_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.claim_recording_operations(p_limit integer DEFAULT 20)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations;
BEGIN
 FOR o IN SELECT * FROM recording_private.operations x WHERE x.state IN ('awaiting_upload','deleting') AND x.next_attempt_at<=now() AND (x.lease_until IS NULL OR x.lease_until<=now())
 AND (x.state='deleting' OR x.upload_deadline<=now() OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='voice-notes' AND name=x.object_path))
 ORDER BY x.next_attempt_at,x.created_at,x.id LIMIT greatest(1,least(coalesce(p_limit,20),20)) FOR UPDATE SKIP LOCKED LOOP
  UPDATE recording_private.operations SET lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() WHERE id=o.id RETURNING * INTO o;
  RETURN NEXT recording_private.reply(o)||jsonb_build_object('lease_token',o.lease_token);
 END LOOP;
END$function$
;

CREATE OR REPLACE FUNCTION public.clear_account_drawings_v2(p_expected_owner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Account changed' USING ERRCODE='42501'; END IF;
 DELETE FROM public.drawings WHERE user_id=auth.uid();
END $function$
;

CREATE OR REPLACE FUNCTION public.close_expired_rooms()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_closed integer;
BEGIN
  UPDATE public.study_rooms sr
  SET status = 'closed'
  WHERE sr.status = 'active'
    AND (
      -- condition 1: past expiry
      sr.expires_at < now()
      OR
      -- condition 2: empty and older than 10 minutes
      (
        sr.created_at < now() - interval '10 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM public.room_members rm
          WHERE rm.room_id = sr.id
        )
      )
    );
  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.commit_billing_reconciliation(p_event_id text, p_created bigint, p_user_id uuid, p_plan text, p_customer_id text, p_subscription_id text, p_status text, p_token uuid, p_subscription_created bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_ai_request(p_reservation uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.ai_request_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ai_request_reservations WHERE id=p_reservation FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_row.status='completed' THEN RETURN true; END IF;
  IF v_row.status <> 'pending' OR v_row.expires_at <= now() THEN RETURN false; END IF;
  UPDATE public.ai_request_reservations SET status='completed' WHERE id=p_reservation;
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_recording_cleanup(p_id uuid, p_lease uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.prepare_recording_cleanup(p_id,p_lease);
 IF EXISTS(SELECT 1 FROM storage.objects s JOIN recording_private.operations o ON o.object_path=s.name WHERE s.bucket_id='voice-notes' AND o.id=p_id) THEN RAISE EXCEPTION 'Recording object removal is not confirmed'; END IF;
 UPDATE recording_private.operations SET state='deleted',lease_token=NULL,lease_until=NULL,updated_at=now(),last_error=NULL WHERE id=p_id;
END$function$
;

CREATE OR REPLACE FUNCTION public.confirm_recording_upload(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN recording_private.publish(p_id,auth.uid(),NULL);
END$function$
;

CREATE OR REPLACE FUNCTION public.create_direct_message_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_username   text;
  v_avatar_url text;
BEGIN
  SELECT p.username, p.avatar_url
    INTO v_username, v_avatar_url
  FROM public.profiles p
  WHERE p.id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, data)
  VALUES (
    NEW.recipient_id,
    'direct_message',
    jsonb_build_object(
      'sender_id',     NEW.sender_id,
      'sender_name',   v_username,
      'sender_avatar', v_avatar_url,
      'snippet',       LEFT(NEW.content, 80)
    )
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_flashcard_deck_v2(p_name text, p_description text, p_document_id text, p_generation uuid, p_cards jsonb, p_expected_owner uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); deck uuid:=gen_random_uuid(); card jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF uid IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Account changed' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_name),'') IS NULL OR jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid deck input' USING ERRCODE='22023'; END IF;
 IF p_document_id IS NOT NULL THEN PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 ELSIF p_generation IS NOT NULL THEN RAISE EXCEPTION 'Standalone deck has no generation' USING ERRCODE='PDD02'; END IF;
 INSERT INTO public.flashcard_decks(id,user_id,name,description,doc_id,document_generation)
 VALUES(deck,uid,btrim(p_name),coalesce(btrim(p_description),''),p_document_id,p_generation);
 FOR card IN SELECT value FROM jsonb_array_elements(p_cards) LOOP
  IF jsonb_typeof(card->'question') IS DISTINCT FROM 'string' OR jsonb_typeof(card->'answer') IS DISTINCT FROM 'string'
   OR nullif(btrim(card->>'question'),'') IS NULL OR nullif(btrim(card->>'answer'),'') IS NULL THEN RAISE EXCEPTION 'Invalid flashcard input' USING ERRCODE='22023'; END IF;
  INSERT INTO public.flashcards(id,user_id,deck_id,doc_id,document_generation,page_num,question,answer)
   VALUES(gen_random_uuid(),uid,deck,coalesce(p_document_id,'deck:'||deck::text),p_generation,0,btrim(card->>'question'),btrim(card->>'answer'));
 END LOOP;
 RETURN deck;
END $function$
;

CREATE OR REPLACE FUNCTION public.create_friend_accepted_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_username   text;
  v_avatar_url text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    -- The accepter is the receiver of the original request: only the
    -- receiver can meaningfully accept a pending friendship.
    SELECT p.username, p.avatar_url
      INTO v_username, v_avatar_url
    FROM public.profiles p
    WHERE p.id = NEW.receiver_id;

    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
      NEW.requester_id,
      'friend_accepted',
      jsonb_build_object(
        'friendship_id',   NEW.id,
        'accepter_id',     NEW.receiver_id,
        'accepter_name',   v_username,
        'accepter_avatar', v_avatar_url
      )
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_friend_request_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_username   text;
  v_avatar_url text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT p.username, p.avatar_url
    INTO v_username, v_avatar_url
  FROM public.profiles p
  WHERE p.id = NEW.requester_id;

  INSERT INTO public.notifications (user_id, type, data)
  VALUES (
    NEW.receiver_id,
    'friend_request',
    jsonb_build_object(
      'friendship_id',    NEW.id,
      'requester_id',     NEW.requester_id,
      'requester_name',   v_username,
      'requester_avatar', v_avatar_url
    )
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_document_recordings(p_document_id text, p_generation uuid, p_expected_owner uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); op_id uuid; cancelled integer:=0;
BEGIN
 -- Advisory locks serialize acceptance but cannot refresh an older RR snapshot.
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Recording scope deletion requires READ COMMITTED isolation' USING ERRCODE='25000';
 END IF;
 IF uid IS NULL OR uid IS DISTINCT FROM p_expected_owner OR p_document_id IS NULL THEN RAISE EXCEPTION 'Recording authorization required' USING ERRCODE='42501'; END IF;
 IF NOT recording_private.scope_allowed(uid,'document',p_document_id,p_generation) THEN
  -- A committed parent deletion may have lost its response. Only its exact
  -- retained owner/generation can acknowledge retry and cancel remaining work.
  PERFORM 1 FROM public.document_tombstones t JOIN auth.users u ON u.id=t.user_id
   WHERE t.document_id=p_document_id AND t.user_id=uid AND t.generation=p_generation FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recording document generation authorization required' USING ERRCODE='42501'; END IF;
 END IF;
 -- Match begin: parent locks precede the owner advisory lock and operation locks.
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,7801));
 FOR op_id IN SELECT id FROM recording_private.operations WHERE owner_id=uid AND scope='document' AND scope_id=p_document_id AND document_generation=p_generation AND state NOT IN ('deleting','deleted') ORDER BY id LOOP
  PERFORM public.request_recording_deletion(op_id);
  cancelled:=cancelled+1;
 END LOOP;
 RETURN cancelled;
END$function$
;

CREATE OR REPLACE FUNCTION public.delete_recording_identity(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_expected_owner uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR uid IS DISTINCT FROM p_expected_owner OR p_note_id IS NULL OR p_scope IS NULL OR p_scope NOT IN ('document','room') OR p_scope_id IS NULL THEN RAISE EXCEPTION 'Recording authorization required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_note_id::text,7802));
 SELECT * INTO o FROM recording_private.operations WHERE note_id=p_note_id;
 IF FOUND THEN
  IF o.owner_id<>uid OR o.scope<>p_scope OR o.scope_id<>p_scope_id OR o.document_generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'Recording identity mismatch' USING ERRCODE='42501'; END IF;
  RETURN public.request_recording_deletion(o.id);
 END IF;
 IF NOT recording_private.scope_allowed(uid,p_scope,p_scope_id,p_generation) THEN RAISE EXCEPTION 'Recording scope authorization required' USING ERRCODE='42501'; END IF;
 INSERT INTO recording_private.operations(note_id,owner_id,scope,scope_id,document_generation,state,mime,byte_size,page_number,duration,recorded_at)
 VALUES(p_note_id,uid,p_scope,p_scope_id,p_generation,'deleted','audio/webm',0,'',0,now()) RETURNING * INTO o;
 RETURN recording_private.reply(o);
END$function$
;

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := p_user_id;
  v_hosted_room_ids uuid[];
  v_post_ids uuid[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR v_uid IS NULL THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_hosted_room_ids
    FROM public.study_rooms
   WHERE host_user_id = v_uid;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_post_ids
    FROM public.community_posts
   WHERE user_id = v_uid;

  -- Rooms hosted by this account are owned spaces and are deleted together.
  DELETE FROM public.room_document_events
   WHERE user_id = v_uid OR room_id = ANY(v_hosted_room_ids);
  DELETE FROM public.room_invitations
   WHERE inviter_id = v_uid OR invitee_id = v_uid OR room_id = ANY(v_hosted_room_ids);
  DELETE FROM public.room_voice_notes
   WHERE user_id = v_uid OR room_id = ANY(v_hosted_room_ids);
  DELETE FROM public.room_strokes
   WHERE user_id = v_uid OR room_id = ANY(v_hosted_room_ids);
  DELETE FROM public.room_drawings
   WHERE room_id = ANY(v_hosted_room_ids);
  DELETE FROM public.room_blank_pages
   WHERE room_id = ANY(v_hosted_room_ids);
  UPDATE public.room_blank_pages
     SET created_by = NULL
   WHERE created_by = v_uid;
  DELETE FROM public.room_members
   WHERE user_id = v_uid OR room_id = ANY(v_hosted_room_ids);
  DELETE FROM public.study_rooms
   WHERE id = ANY(v_hosted_room_ids);

  -- Community content authored by the user is removed. Reactions/comments on
  -- a deleted post must also go because their parent content no longer exists.
  DELETE FROM public.post_likes
   WHERE user_id = v_uid OR post_id = ANY(v_post_ids);
  DELETE FROM public.post_comments
   WHERE user_id = v_uid OR post_id = ANY(v_post_ids);
  DELETE FROM public.community_posts WHERE user_id = v_uid;
  DELETE FROM public.follows WHERE follower_id = v_uid OR following_id = v_uid;

  -- Remove both sides of conversations involving the deleted identity. This
  -- avoids retaining recipient identifiers and satisfies auth-user FKs.
  DELETE FROM public.direct_messages
   WHERE sender_id = v_uid OR recipient_id = v_uid;
  DELETE FROM public.friendships WHERE requester_id = v_uid OR receiver_id = v_uid;
  DELETE FROM public.notifications
   WHERE user_id = v_uid
      OR data->>'sender_id' = v_uid::text
      OR data->>'requester_id' = v_uid::text
      OR data->>'inviter_id' = v_uid::text;

  DELETE FROM public.document_favorites WHERE user_id = v_uid;
  DELETE FROM public.document_tags WHERE user_id = v_uid;
  DELETE FROM public.study_sessions WHERE user_id = v_uid;
  DELETE FROM public.session_state WHERE user_id = v_uid;
  DELETE FROM public.page_image_annotations WHERE user_id = v_uid;
  DELETE FROM public.blank_pages WHERE user_id = v_uid;
  DELETE FROM public.bookmarks WHERE user_id = v_uid;
  DELETE FROM public.key_terms WHERE user_id = v_uid;
  DELETE FROM public.drawings WHERE user_id = v_uid;
  DELETE FROM public.text_notes WHERE user_id = v_uid;
  DELETE FROM public.voice_notes WHERE user_id = v_uid;
  DELETE FROM public.flashcards WHERE user_id = v_uid;
  DELETE FROM public.flashcard_decks WHERE user_id = v_uid;
  DELETE FROM public.documents WHERE user_id = v_uid;

  DELETE FROM public.user_preferences WHERE user_id = v_uid;
  DELETE FROM public.user_settings WHERE user_id = v_uid;
  DELETE FROM public.active_sessions WHERE user_id = v_uid;
  DELETE FROM public.ai_usage WHERE user_id = v_uid;
  DELETE FROM public.referrals WHERE referrer_id = v_uid OR referred_id = v_uid;
  DELETE FROM public.subscriptions WHERE user_id = v_uid;
  DELETE FROM public.profiles WHERE id = v_uid;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.direct_messages_lock_immutable_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.sender_id    IS DISTINCT FROM OLD.sender_id    THEN RAISE EXCEPTION 'direct_messages.sender_id is immutable';    END IF;
  IF NEW.recipient_id IS DISTINCT FROM OLD.recipient_id THEN RAISE EXCEPTION 'direct_messages.recipient_id is immutable'; END IF;
  IF NEW.content      IS DISTINCT FROM OLD.content      THEN RAISE EXCEPTION 'direct_messages.content is immutable';      END IF;
  IF NEW.created_at   IS DISTINCT FROM OLD.created_at   THEN RAISE EXCEPTION 'direct_messages.created_at is immutable';   END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.document_collection_definition(p_collection text)
 RETURNS TABLE(doc_column text, page_column text, write_columns text)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 doc_column:='document_id'; page_column:=NULL;
 CASE p_collection
 WHEN 'text_notes' THEN page_column:='page_key'; write_columns:='id,user_id,document_id,document_generation,page_key,x,y,width,height,content,font_size,color,category';
 WHEN 'bookmarks' THEN write_columns:='id,user_id,document_id,document_generation,virtual_index,label,created_at';
 WHEN 'key_terms' THEN write_columns:='id,user_id,document_id,document_generation,term,definition,created_at';
 WHEN 'blank_pages' THEN write_columns:='id,user_id,document_id,document_generation,insert_after_page,canvas_data,images,bg_theme,created_at';
 WHEN 'flashcards' THEN doc_column:='doc_id'; page_column:='page_num'; write_columns:='id,user_id,doc_id,document_generation,page_num,question,answer,deck_id';
 WHEN 'drawings' THEN page_column:='page_key'; write_columns:='id,user_id,document_id,document_generation,page_key,canvas_data,updated_at';
 WHEN 'page_image_annotations' THEN page_column:='page_number'; write_columns:='user_id,document_id,document_generation,page_number,images,updated_at';
 WHEN 'session_state' THEN doc_column:='doc_id'; write_columns:='user_id,doc_id,document_generation,virtual_index,updated_at';
 ELSE RAISE EXCEPTION 'Unsupported document collection' USING ERRCODE='22023';
 END CASE;
 RETURN NEXT;
END $function$
;

CREATE OR REPLACE FUNCTION public.expire_referral_rewards()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_profile record; v_count integer := 0;
BEGIN
  FOR v_profile IN
    SELECT id,plan,is_vip FROM public.profiles
    WHERE referral_expires_at IS NOT NULL AND referral_expires_at <= now()
    ORDER BY id LIMIT 500 FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.profiles SET
      plan=CASE WHEN v_profile.plan='premium' AND NOT coalesce(v_profile.is_vip,false)
        AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id=v_profile.id
          AND s.plan IN ('premium','pro') AND s.status IN ('active','trialing','past_due'))
        THEN 'free' ELSE plan END,
      referral_expires_at=NULL
    WHERE id=v_profile.id;
    v_count := v_count+1;
  END LOOP;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_private_profile()
 RETURNS TABLE(plan text, is_vip boolean, referral_code text, referral_expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p.plan, p.is_vip, p.referral_code, p.referral_expires_at FROM public.profiles p WHERE p.id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_referral_count()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 0::bigint
    ELSE count(*)::bigint
  END
  FROM public.referrals
  WHERE referrer_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.get_recording_operation(p_note_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT recording_private.reply(o) FROM recording_private.operations o WHERE note_id=p_note_id AND owner_id=auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.get_study_streak(p_user_id uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with study_days as (
    select distinct date_trunc('day', started_at)::date as d
    from public.study_sessions
    where user_id = p_user_id and p_user_id = auth.uid() and ended_at is not null
  ),
  with_grp as (
    select d, d - (row_number() over (order by d))::int as grp from study_days
  ),
  anchor as (
    select grp from with_grp where d >= current_date - 1 order by d desc limit 1
  )
  select coalesce((select count(*)::int from with_grp w, anchor a where w.grp = a.grp), 0)
$function$
;

CREATE OR REPLACE FUNCTION public.get_study_time_map(p_user_id uuid, p_doc_ids text[])
 RETURNS TABLE(document_id text, total_seconds bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select s.document_id, sum(s.duration_seconds)::bigint
  from public.study_sessions s
  where s.user_id = p_user_id and p_user_id = auth.uid()
    and s.ended_at is not null and s.document_id = any(p_doc_ids)
  group by s.document_id
$function$
;

CREATE OR REPLACE FUNCTION public.get_today_study_seconds(p_user_id uuid DEFAULT auth.uid())
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(duration_seconds)::int, 0)
  from public.study_sessions
  where user_id = p_user_id and p_user_id = auth.uid()
    and ended_at is not null
    and date_trunc('day', started_at) = date_trunc('day', now())
$function$
;

CREATE OR REPLACE FUNCTION public.guard_document_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 ref text; owner uuid; gen uuid; deck record; identity_unchanged boolean:=false;
BEGIN
 ref:=row_data->>TG_ARGV[0]; owner:=(row_data->>'user_id')::uuid; gen:=(row_data->>'document_generation')::uuid;
 IF TG_OP='UPDATE' THEN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Document child owner is immutable' USING ERRCODE='42501'; END IF;
  identity_unchanged:=ref IS NOT DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[0]) AND NEW.document_generation IS NOT DISTINCT FROM OLD.document_generation;
 END IF;
 -- Existing RLS / vetted definer RPCs authorize unchanged-identity updates
 -- (for example another user's like counter). The lifetime check still runs.
 IF NOT identity_unchanged AND (owner IS NULL OR (coalesce(auth.role(),'')<>'service_role' AND auth.uid() IS DISTINCT FROM owner)) THEN
  RAISE EXCEPTION 'Document child owner authorization required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF ref IS NULL THEN
  IF gen IS NOT NULL THEN RAISE EXCEPTION 'Detached row cannot retain a document generation' USING ERRCODE='PDD02'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='flashcards' AND row_data->>'deck_id' IS NOT NULL THEN
  SELECT user_id,doc_id,document_generation INTO deck FROM public.flashcard_decks WHERE id::text=row_data->>'deck_id' FOR KEY SHARE;
  IF NOT FOUND OR deck.user_id IS DISTINCT FROM owner THEN RAISE EXCEPTION 'Flashcard deck is not owned by caller' USING ERRCODE='42501'; END IF;
  IF ref='deck:'||(row_data->>'deck_id') AND deck.doc_id IS NULL AND gen IS NULL THEN RETURN NEW; END IF;
  IF deck.doc_id IS DISTINCT FROM ref OR deck.document_generation IS DISTINCT FROM gen THEN RAISE EXCEPTION 'Flashcard deck document mismatch' USING ERRCODE='PDD02'; END IF;
 END IF;
 IF identity_unchanged THEN
  PERFORM 1 FROM public.documents WHERE id::text=ref AND user_id=owner AND generation=gen FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document missing or generation changed' USING ERRCODE='PDD01'; END IF;
 ELSE
  PERFORM public.assert_document_generation(ref,gen,owner);
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_document_lifetime()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE target_owner uuid; lifetime public.document_lifetimes%ROWTYPE; plan_name text; vip boolean; document_count bigint;
BEGIN
 target_owner := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 IF target_owner IS NULL OR (coalesce(auth.role(),'')<>'service_role' AND auth.uid() IS DISTINCT FROM target_owner) THEN
  RAISE EXCEPTION 'Document owner authorization required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.generation IS DISTINCT FROM OLD.generation) THEN
  RAISE EXCEPTION 'Document identity and generation are immutable' USING ERRCODE='PDD02';
 END IF;
 IF TG_OP='INSERT' THEN
  -- AFTER INSERT is deliberate: ON CONFLICT/unique-row waits have resolved.
  -- Locking the permanent anchor then observes a committed delete, or raises
  -- a serialization error for a stale repeatable-read snapshot.
  INSERT INTO public.document_lifetimes(document_id,user_id,generation) VALUES(NEW.id::text,NEW.user_id,NEW.generation) ON CONFLICT DO NOTHING;
  SELECT * INTO lifetime FROM public.document_lifetimes WHERE document_id=NEW.id::text FOR UPDATE;
  IF lifetime.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Deleted document IDs cannot be reused' USING ERRCODE='PDD01'; END IF;
  IF lifetime.user_id<>NEW.user_id THEN RAISE EXCEPTION 'Document ID belongs to another owner' USING ERRCODE='42501'; END IF;
  IF lifetime.generation<>NEW.generation THEN RAISE EXCEPTION 'Document generation mismatch' USING ERRCODE='PDD02'; END IF;
  INSERT INTO public.document_owner_epochs(user_id,revision) VALUES(NEW.user_id,1)
   ON CONFLICT(user_id) DO UPDATE SET revision=document_owner_epochs.revision+1;
  SELECT plan,is_vip INTO plan_name,vip FROM public.profiles WHERE id=NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document owner profile missing' USING ERRCODE='42501'; END IF;
  IF NOT coalesce(vip,false) AND coalesce(plan_name,'free') NOT IN ('premium','pro') THEN
   SELECT count(*) INTO document_count FROM public.documents WHERE user_id=NEW.user_id;
   IF document_count>3 THEN RAISE EXCEPTION 'Document quota exceeded' USING ERRCODE='PDQ01'; END IF;
  END IF;
 ELSIF TG_OP='DELETE' THEN
  DELETE FROM public.document_collection_receipts WHERE document_id=OLD.id::text AND user_id=OLD.user_id;
  DELETE FROM public.document_collection_revisions WHERE document_id=OLD.id::text AND user_id=OLD.user_id;
  UPDATE public.document_lifetimes SET deleted_at=coalesce(deleted_at,clock_timestamp())
   WHERE document_id=OLD.id::text AND user_id=OLD.user_id AND generation=OLD.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document lifetime missing' USING ERRCODE='PDD01'; END IF;
 ELSE
  PERFORM public.assert_document_generation(NEW.id::text,NEW.generation,NEW.user_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested_handle text;
  generated_base text;
  final_handle text;
begin
  requested_handle := nullif(trim(new.raw_user_meta_data->>'handle'), '');
  if requested_handle is not null then
    final_handle := public.normalize_profile_handle(requested_handle);
    if final_handle <> lower(requested_handle) or length(final_handle) not between 3 and 24 then
      raise exception 'Invalid account handle' using errcode = '23514';
    end if;
  else
    generated_base := public.normalize_profile_handle(coalesce(
      nullif(new.raw_user_meta_data->>'preferred_username', ''),
      nullif(new.raw_user_meta_data->>'username', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'user'
    ));
    if length(generated_base) < 3 then generated_base := 'user'; end if;
    final_handle := left(generated_base, 11) || '_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  insert into public.profiles (id, username, handle, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    final_handle,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data->>'picture'), '')
    )
  );
  return new;
exception when unique_violation then
  raise exception 'This account handle is already taken' using errcode = '23505';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id uuid, p_month text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  new_count integer;
begin
  insert into public.ai_usage (user_id, month, count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month)
  do update set count = public.ai_usage.count + 1
  returning count into new_count;
  return new_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_to_room(p_room_id uuid, p_invitee_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.study_rooms%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN 'unauthenticated'; END IF;
  IF p_invitee_id IS NULL OR p_invitee_id = v_uid THEN RETURN 'invalid_invitee'; END IF;

  SELECT * INTO v_room
    FROM public.study_rooms
   WHERE id = p_room_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_room.status <> 'active' THEN RETURN 'closed'; END IF;
  IF v_room.expires_at IS NOT NULL AND v_room.expires_at <= now() THEN RETURN 'expired'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_members rm
     WHERE rm.room_id = p_room_id AND rm.user_id = v_uid
  ) THEN
    RETURN 'not_member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
     WHERE f.status = 'accepted'
       AND ((f.requester_id = v_uid AND f.receiver_id = p_invitee_id)
         OR (f.receiver_id = v_uid AND f.requester_id = p_invitee_id))
  ) THEN
    RETURN 'not_friend';
  END IF;

  INSERT INTO public.room_invitations (
    room_id, inviter_id, invitee_id, status, expires_at, accepted_at
  ) VALUES (
    p_room_id, v_uid, p_invitee_id, 'pending',
    COALESCE(v_room.expires_at, now() + interval '6 hours'), NULL
  )
  ON CONFLICT (room_id, invitee_id) DO UPDATE SET
    inviter_id = EXCLUDED.inviter_id,
    status = 'pending',
    expires_at = EXCLUDED.expires_at,
    accepted_at = NULL,
    created_at = now();

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.notifications (user_id, type, data)
  VALUES (
    p_invitee_id,
    'room_invite',
    jsonb_build_object(
      'room_id', p_room_id,
      'room_name', v_room.document_name,
      'inviter_id', v_uid,
      'inviter_name', v_profile.username,
      'inviter_avatar', v_profile.avatar_url
    )
  );

  RETURN 'invited';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_handle_available(p_handle text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    p_handle = public.normalize_profile_handle(p_handle)
    and length(p_handle) between 3 and 24
    and not exists (
      select 1
      from public.profiles
      where handle = p_handle
        and id is distinct from auth.uid()
    ),
    false
  )
$function$
;

CREATE OR REPLACE FUNCTION public.join_room_atomic(p_room_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_status text;
  v_host uuid;
  v_expires_at timestamptz;
  v_count int;
  v_plan text;
  v_is_vip boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN 'unauthenticated'; END IF;

  SELECT max_members, status, host_user_id, expires_at
    INTO v_max, v_status, v_host, v_expires_at
    FROM public.study_rooms
   WHERE id = p_room_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status <> 'active' THEN RETURN 'closed'; END IF;
  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN RETURN 'expired'; END IF;

  SELECT COALESCE(plan, 'free'), COALESCE(is_vip, false)
    INTO v_plan, v_is_vip
    FROM public.profiles
   WHERE id = v_uid;
  IF NOT FOUND OR (NOT v_is_vip AND v_plan = 'free') THEN RETURN 'plan_required'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_members
     WHERE room_id = p_room_id AND user_id = v_uid
  ) THEN
    RETURN 'rejoined';
  END IF;

  IF v_uid <> v_host AND NOT EXISTS (
    SELECT 1 FROM public.room_invitations ri
     WHERE ri.room_id = p_room_id
       AND ri.invitee_id = v_uid
       AND ri.status IN ('pending', 'accepted')
       AND ri.expires_at > now()
  ) THEN
    RETURN 'not_invited';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.room_members
   WHERE room_id = p_room_id;
  IF v_count >= COALESCE(v_max, 10) THEN RETURN 'full'; END IF;

  INSERT INTO public.room_members (room_id, user_id)
  VALUES (p_room_id, v_uid)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  UPDATE public.room_invitations
     SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
   WHERE room_id = p_room_id AND invitee_id = v_uid;

  RETURN 'joined';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_room_atomic(p_room_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  DELETE FROM public.room_members
   WHERE room_id = p_room_id
     AND user_id = v_uid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN 'not_member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_members WHERE room_id = p_room_id
  ) THEN
    UPDATE public.study_rooms
       SET status = 'closed'
     WHERE id = p_room_id;
    RETURN 'last';
  END IF;

  RETURN 'left';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_room_atomic(p_room_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_removed integer;
BEGIN
  -- Same row lock used by join_room_atomic: joining cannot race room closure.
  PERFORM 1 FROM public.study_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  IF v_removed = 0 THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id) THEN RETURN false; END IF;
  UPDATE public.study_rooms SET status = 'closed' WHERE id = p_room_id;
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mutual_friend_counts(p_other_ids uuid[])
 RETURNS TABLE(other_user_id uuid, mutual_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
    me AS (
      SELECT auth.uid() AS uid
    ),
    my_friends AS (
      SELECT
        CASE
          WHEN f.requester_id = (SELECT uid FROM me)
            THEN f.receiver_id
          ELSE f.requester_id
        END AS friend_id
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          f.requester_id = (SELECT uid FROM me)
          OR f.receiver_id = (SELECT uid FROM me)
        )
    ),
    others AS (
      SELECT unnest(p_other_ids) AS other_id
    ),
    their_friends AS (
      SELECT
        o.other_id,
        CASE
          WHEN f.requester_id = o.other_id
            THEN f.receiver_id
          ELSE f.requester_id
        END AS friend_id
      FROM others o
      JOIN public.friendships f
        ON f.status = 'accepted'
       AND (f.requester_id = o.other_id OR f.receiver_id = o.other_id)
    )
  SELECT
    o.other_id AS other_user_id,
    COALESCE(
      COUNT(DISTINCT tf.friend_id) FILTER (
        WHERE tf.friend_id IN (SELECT friend_id FROM my_friends)
          AND tf.friend_id != (SELECT uid FROM me)
          AND tf.friend_id != o.other_id
      ),
      0
    )::int AS mutual_count
  FROM others o
  LEFT JOIN their_friends tf ON tf.other_id = o.other_id
  GROUP BY o.other_id;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_profile_handle(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select lower(regexp_replace(coalesce(input, ''), '[^a-zA-Z0-9_]+', '', 'g'))
$function$
;

CREATE OR REPLACE FUNCTION public.office_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_recording_cleanup(p_id uuid, p_lease uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id FOR UPDATE;
 IF o.state<>'deleting' OR o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<=now() THEN RAISE EXCEPTION 'Stale recording cleanup lease'; END IF;
 IF o.object_path IS NULL THEN RAISE EXCEPTION 'Unknown recording object path'; END IF;
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording cleanup requires a private nonversioned bucket'; END IF;
 -- Unknown legacy URLs may be aliases/proxies for an adopted object. Refuse to
 -- guess equivalence; operator reconciliation must remove this ambiguity first.
 IF o.legacy AND (EXISTS(SELECT 1 FROM public.voice_notes v JOIN recording_private.operations b ON b.id=v.recording_operation_id WHERE b.legacy AND b.state='blocked')
 OR EXISTS(SELECT 1 FROM public.room_voice_notes v JOIN recording_private.operations b ON b.id=v.recording_operation_id WHERE b.legacy AND b.state='blocked')) THEN RAISE EXCEPTION 'Ambiguous legacy audio references require reconciliation'; END IF;
 IF EXISTS(SELECT 1 FROM public.voice_notes WHERE recording_operation_id=o.id OR audio_url=o.playback_url OR right(split_part(audio_url,'?',1),length('/voice-notes/'||o.object_path))='/voice-notes/'||o.object_path)
 OR EXISTS(SELECT 1 FROM public.room_voice_notes WHERE recording_operation_id=o.id OR audio_url=o.playback_url OR right(split_part(audio_url,'?',1),length('/voice-notes/'||o.object_path))='/voice-notes/'||o.object_path) THEN RAISE EXCEPTION 'Recording audio is still referenced'; END IF;
 RETURN o.object_path;
END$function$
;

CREATE OR REPLACE FUNCTION public.profiles_lock_privileged_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Privileged contexts bypass: service_role (PostgREST with the service
  -- key), postgres (DB owner), and supabase_admin (dashboard / migrations).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Immutable columns (no one should mutate these via this path either).
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'profiles.created_at is immutable';
  END IF;

  -- Privileged: billing & admin-only fields.
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'profiles.plan is read-only — billing system only';
  END IF;
  IF NEW.is_vip IS DISTINCT FROM OLD.is_vip THEN
    RAISE EXCEPTION 'profiles.is_vip is read-only — admin only';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'profiles.referral_code is read-only — server-issued';
  END IF;
  IF NEW.referral_expires_at IS DISTINCT FROM OLD.referral_expires_at THEN
    RAISE EXCEPTION 'profiles.referral_expires_at is read-only — server-issued';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.publish_claimed_recording(p_id uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$BEGIN IF p_lease IS NULL THEN RAISE EXCEPTION 'Recording lease required'; END IF; RETURN recording_private.publish(p_id,NULL,p_lease); END$function$
;

CREATE OR REPLACE FUNCTION public.read_document_collection_v2(p_collection text, p_document_id text, p_generation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); definition record; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO definition FROM public.document_collection_definition(p_collection);
 PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 -- Both subqueries share one statement snapshot. Reading a revision after a
 -- separate data request would incorrectly acknowledge a newer remote edit.
 EXECUTE format('SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.%I r WHERE user_id=$1 AND %I::text=$2 AND document_generation=$3),''[]''::jsonb),''revisions'',coalesce((SELECT jsonb_object_agg(page_key,revision) FROM public.document_collection_revisions WHERE user_id=$1 AND document_id=$2 AND generation=$3 AND collection=$4),''{}''::jsonb))',p_collection,definition.doc_column)
 INTO result USING uid,p_document_id,p_generation,p_collection;
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.reconcile_ai_requests(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.recording_legacy_playback_allowed(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM recording_private.operations o
  WHERE o.object_path=p_path AND o.legacy AND o.state='published'
  AND EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid())
  AND (
   (o.scope='document' AND o.owner_id=auth.uid() AND EXISTS(
    SELECT 1 FROM public.voice_notes v JOIN public.documents d ON d.id=v.document_id
    WHERE v.recording_operation_id=o.id AND v.id=o.note_id AND v.user_id=o.owner_id
    AND v.document_id=o.scope_id AND d.user_id=o.owner_id AND d.generation=o.document_generation
   )) OR
   (o.scope='room' AND EXISTS(
    SELECT 1 FROM public.room_voice_notes v
    WHERE v.recording_operation_id=o.id AND v.id=o.note_id AND v.user_id=o.owner_id
    AND v.room_id::text=o.scope_id AND public.recording_room_member(v.room_id)
   ))
  )
 )
$function$
;

CREATE OR REPLACE FUNCTION public.recording_playback_path(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id AND state='published';
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'Playback unauthorized' USING ERRCODE='42501'; END IF;
 IF o.scope='document' THEN
  IF o.owner_id<>auth.uid() OR NOT recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation) THEN RAISE EXCEPTION 'Playback unauthorized' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT recording_private.scope_allowed(auth.uid(),'room',o.scope_id,NULL) THEN RAISE EXCEPTION 'Playback unauthorized' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN o.object_path;
END$function$
;

CREATE OR REPLACE FUNCTION public.recording_room_member(p_room uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.room_members m JOIN public.study_rooms r ON r.id=m.room_id JOIN auth.users u ON u.id=m.user_id WHERE m.room_id=p_room AND m.user_id=auth.uid() AND r.status='active' AND (r.expires_at IS NULL OR r.expires_at>now()))
$function$
;

CREATE OR REPLACE FUNCTION public.recording_upload_allowed(p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO o FROM recording_private.operations WHERE object_path=p_path;
 IF NOT FOUND OR o.owner_id IS DISTINCT FROM auth.uid() OR o.legacy THEN RETURN false; END IF;
 IF NOT recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation) THEN RETURN false; END IF;
 SELECT * INTO o FROM recording_private.operations WHERE id=o.id FOR UPDATE;
 RETURN o.state='awaiting_upload' AND o.upload_deadline>now();
END$function$
;

CREATE OR REPLACE FUNCTION public.recording_worker_token_ok(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(length(p_token) = 64 AND p_token = (SELECT token FROM worker_private.recording_worker_token WHERE id = 1), false)
$function$
;

CREATE OR REPLACE FUNCTION public.redeem_referral(p_user_id uuid, p_code text, p_ip_address text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.refund_ai_request(p_reservation uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.ai_request_reservations%ROWTYPE;
BEGIN
  DELETE FROM public.ai_request_reservations WHERE id=p_reservation AND status IN ('pending','legacy') RETURNING * INTO v_row;
  IF FOUND THEN
    UPDATE public.ai_usage SET count=greatest(0,count-1) WHERE user_id=v_row.user_id AND month=v_row.month;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_billing_reconciliation(p_subscription_id text, p_token uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  DELETE FROM public.billing_reconciliation_leases WHERE subscription_id=p_subscription_id AND token=p_token;
$function$
;

CREATE OR REPLACE FUNCTION public.release_recording_lease(p_id uuid, p_lease uuid, p_error text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 UPDATE recording_private.operations SET lease_token=NULL,lease_until=NULL,last_error=left(p_error,300),next_attempt_at=now()+make_interval(secs=>least(300,5*greatest(1,attempts))),updated_at=now() WHERE id=p_id AND lease_token=p_lease
$function$
;

CREATE OR REPLACE FUNCTION public.rename_recording(p_note_id uuid, p_title text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE note_id=p_note_id AND owner_id=auth.uid();
 IF length(coalesce(p_title,''))>500 THEN RAISE EXCEPTION 'Recording title is too long'; END IF;
 IF NOT recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation) THEN RAISE EXCEPTION 'Recording authorization revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=o.id FOR UPDATE;
 IF o.state NOT IN ('awaiting_upload','published') THEN RAISE EXCEPTION 'Recording is deleted or blocked'; END IF;
 UPDATE recording_private.operations SET title=p_title,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF o.state='published' THEN
  IF o.scope='document' THEN UPDATE public.voice_notes SET title=p_title WHERE recording_operation_id=o.id;
  ELSE UPDATE public.room_voice_notes SET title=p_title WHERE recording_operation_id=o.id; END IF;
 END IF;
 RETURN recording_private.reply(o);
END$function$
;

CREATE OR REPLACE FUNCTION public.replace_study_collection(p_collection text, p_document_id text, p_page_key text, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN RAISE EXCEPTION 'Client upgrade required: generation and collection revision are mandatory' USING ERRCODE='PDU01'; END $function$
;

CREATE OR REPLACE FUNCTION public.replace_study_collection_v2(p_collection text, p_document_id text, p_generation uuid, p_page_key text, p_expected_revision bigint, p_write_id uuid, p_rows jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); definition record; page text:=coalesce(p_page_key,''); current_revision bigint;
 receipt public.document_collection_receipts%ROWTYPE; scope jsonb; rows_to_write jsonb; suffix text:='';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_write_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Write ID, nonnegative expected revision and row array required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO definition FROM public.document_collection_definition(p_collection);
 IF definition.page_column IS NOT NULL AND (p_page_key IS NULL OR p_page_key='') THEN RAISE EXCEPTION 'Page key required' USING ERRCODE='22023'; END IF;
 IF definition.page_column IS NULL AND page<>'' THEN RAISE EXCEPTION 'Whole collection requires an empty page key' USING ERRCODE='22023'; END IF;
 IF p_collection IN ('drawings','page_image_annotations','session_state') AND jsonb_array_length(p_rows)>1 THEN RAISE EXCEPTION 'Singleton scope requires at most one row' USING ERRCODE='22023'; END IF;
 PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 PERFORM pg_advisory_xact_lock(hashtextextended('document-write:'||uid::text||':'||p_write_id::text,0));
 SELECT * INTO receipt FROM public.document_collection_receipts WHERE user_id=uid AND write_id=p_write_id;
 IF FOUND THEN
  IF receipt.document_id<>p_document_id OR receipt.generation<>p_generation OR receipt.collection<>p_collection OR receipt.page_key<>page OR receipt.expected_revision<>p_expected_revision OR receipt.payload<>p_rows THEN
   RAISE EXCEPTION 'Write ID reused with different payload or scope' USING ERRCODE='PDC02';
  END IF;
  RETURN receipt.revision;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('document-collection:'||uid::text||':'||p_document_id||':'||p_generation::text||':'||p_collection,0));
 -- Locking the revision row also serializes authorized ancillary row mutations. An
 -- ordinary deadlock/serialization error is retryable; it never commits a stale
 -- replacement. Session state has a single row per owner, across documents.
 IF p_collection='session_state' THEN PERFORM pg_advisory_xact_lock(hashtextextended('document-session:'||uid::text,0)); END IF;
 INSERT INTO public.document_collection_revisions(user_id,document_id,generation,collection,page_key,revision)
  VALUES(uid,p_document_id,p_generation,p_collection,page,0) ON CONFLICT DO NOTHING;
 SELECT revision INTO current_revision FROM public.document_collection_revisions
  WHERE user_id=uid AND document_id=p_document_id AND generation=p_generation AND collection=p_collection AND page_key=page FOR UPDATE;
 IF current_revision<>p_expected_revision THEN RAISE EXCEPTION 'Document collection revision conflict' USING ERRCODE='PDC01'; END IF;
 scope:=jsonb_build_object('user_id',uid,definition.doc_column,p_document_id,'document_generation',p_generation);
 IF definition.page_column IS NOT NULL THEN
  scope:=scope||jsonb_build_object(definition.page_column,CASE WHEN definition.page_column IN ('page_num','page_number') THEN to_jsonb(page::integer) ELSE to_jsonb(page) END);
 END IF;
 SELECT coalesce(jsonb_agg(value||scope||CASE WHEN p_collection IN ('drawings','page_image_annotations','session_state') THEN jsonb_build_object('updated_at',now()) ELSE '{}'::jsonb END||CASE
  WHEN p_collection='flashcards' THEN jsonb_build_object('id',coalesce(value->>'id',gen_random_uuid()::text),'deck_id',NULL)
  WHEN p_collection='drawings' THEN jsonb_build_object('id',uid::text||'_'||p_document_id||'_'||page)
  ELSE '{}'::jsonb END),'[]'::jsonb) INTO rows_to_write FROM jsonb_array_elements(p_rows);
 EXECUTE format('DELETE FROM public.%I r WHERE to_jsonb(r) @> $1',p_collection) USING scope;
 IF p_collection='session_state' THEN suffix:=' ON CONFLICT(user_id) DO UPDATE SET doc_id=excluded.doc_id,document_generation=excluded.document_generation,virtual_index=excluded.virtual_index,updated_at=excluded.updated_at'; END IF;
 EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1)%s',p_collection,definition.write_columns,definition.write_columns,p_collection,suffix) USING rows_to_write;
 -- An empty-to-empty acknowledged clear also advances the revision. Other
 -- authorized row mutations may advance it more than once; clients treat it opaque.
 UPDATE public.document_collection_revisions SET revision=revision+1
  WHERE user_id=uid AND document_id=p_document_id AND generation=p_generation AND collection=p_collection AND page_key=page RETURNING revision INTO current_revision;
 INSERT INTO public.document_collection_receipts(user_id,write_id,document_id,generation,collection,page_key,expected_revision,payload,revision)
  VALUES(uid,p_write_id,p_document_id,p_generation,p_collection,page,p_expected_revision,p_rows,current_revision);
 RETURN current_revision;
END $function$
;

CREATE OR REPLACE FUNCTION public.request_recording_deletion(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations; allowed boolean;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id AND owner_id=auth.uid();
 -- Match metadata RLS for published room contributions. Lock membership before
 -- the operation, preserving the same lock order as publication and uploads.
 IF o.scope='room' THEN allowed:=recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation); END IF;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id AND owner_id=auth.uid() FOR UPDATE;
 IF o.scope='room' AND NOT allowed AND EXISTS(SELECT 1 FROM public.room_voice_notes WHERE recording_operation_id=o.id) THEN RAISE EXCEPTION 'Room membership authorization is required' USING ERRCODE='42501'; END IF;
 IF o.state='deleted' THEN RETURN recording_private.reply(o); END IF;
 UPDATE recording_private.operations SET state=CASE WHEN object_path IS NULL THEN 'blocked' ELSE 'deleting' END,lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF o.scope='document' THEN DELETE FROM public.voice_notes WHERE recording_operation_id=o.id;
 ELSE DELETE FROM public.room_voice_notes WHERE recording_operation_id=o.id; END IF;
 RETURN recording_private.reply(o);
END$function$
;

CREATE OR REPLACE FUNCTION public.reserve_ai_request(p_user_id uuid, p_month text, p_limit integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_limit IS NOT NULL AND p_limit < 0 THEN RAISE EXCEPTION 'Invalid limit'; END IF;
  INSERT INTO public.ai_usage(user_id,month,count) VALUES(p_user_id,p_month,0) ON CONFLICT(user_id,month) DO NOTHING;
  UPDATE public.ai_usage SET count=count+1 WHERE user_id=p_user_id AND month=p_month AND (p_limit IS NULL OR count < p_limit);
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.ai_request_reservations(user_id,month) VALUES(p_user_id,p_month) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_ai_request_v2(p_user_id uuid, p_month text, p_limit integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_checkout_attempt(p_user_id uuid, p_plan text, p_billing text, p_email text, p_origin text)
 RETURNS SETOF billing_checkout_attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_flashcard_v2(p_card_id uuid, p_expected_review_count integer, p_rating text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid(); card public.flashcards%ROWTYPE; days integer; reviewed_at timestamptz:=clock_timestamp();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_rating IS NULL OR p_rating NOT IN ('again','hard','good','easy') THEN RAISE EXCEPTION 'Invalid review rating' USING ERRCODE='22023'; END IF;
 -- Parent lock precedes row lock, matching collection replacement/deletion.
 SELECT * INTO card FROM public.flashcards WHERE id=p_card_id AND user_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Flashcard missing or inaccessible' USING ERRCODE='42501'; END IF;
 IF card.document_generation IS NOT NULL THEN PERFORM public.assert_document_generation(card.doc_id,card.document_generation,uid); END IF;
 SELECT * INTO card FROM public.flashcards WHERE id=p_card_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Flashcard missing or inaccessible' USING ERRCODE='42501'; END IF;
 IF p_expected_review_count IS NULL OR card.review_count IS DISTINCT FROM p_expected_review_count THEN RAISE EXCEPTION 'Flashcard review conflict' USING ERRCODE='PDC01'; END IF;
 days:=coalesce(card.interval_days,0);
 days:=CASE p_rating WHEN 'again' THEN 0 WHEN 'hard' THEN greatest(1,round(greatest(days,1)*1.2)::integer)
  WHEN 'good' THEN CASE WHEN days=0 THEN 1 ELSE greatest(2,days*2) END
  ELSE CASE WHEN days=0 THEN 4 ELSE greatest(4,days*3) END END;
 UPDATE public.flashcards SET interval_days=days,review_count=review_count+1,last_reviewed_at=reviewed_at,
  next_review_at=reviewed_at+CASE WHEN p_rating='again' THEN interval '5 minutes' ELSE days*interval '1 day' END
  WHERE id=p_card_id AND user_id=uid RETURNING * INTO card;
 RETURN to_jsonb(card);
END $function$
;

CREATE OR REPLACE FUNCTION public.save_document_position_v2(p_document_id text, p_generation uuid, p_virtual_index integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_virtual_index IS NULL OR p_virtual_index<0 THEN RAISE EXCEPTION 'Invalid document position' USING ERRCODE='22023'; END IF;
 PERFORM public.assert_document_generation(p_document_id,p_generation,uid);
 INSERT INTO public.session_state(user_id,doc_id,document_generation,virtual_index,updated_at)
 VALUES(uid,p_document_id,p_generation,p_virtual_index,now())
 ON CONFLICT(user_id) DO UPDATE SET doc_id=excluded.doc_id,document_generation=excluded.document_generation,virtual_index=excluded.virtual_index,updated_at=excluded.updated_at;
END $function$
;

CREATE OR REPLACE FUNCTION public.schedule_recording_worker(p_base_url text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION public.search_users(search_query text)
 RETURNS TABLE(id uuid, username text, email text, avatar_url text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id,coalesce(p.username,p.handle),''::text,p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id<>auth.uid()
    AND nullif(trim(search_query),'') IS NOT NULL
    AND (p.username ILIKE '%'||trim(search_query)||'%'
      OR p.handle ILIKE '%'||trim(search_query)||'%')
  ORDER BY CASE WHEN p.username ILIKE trim(search_query)||'%' THEN 0 ELSE 1 END,
    coalesce(p.username,p.handle),p.id
  LIMIT 15;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); already boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = p_post_id AND public.can_view_community_author(p.user_id)) THEN
    RAISE EXCEPTION 'post not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT exists(SELECT 1 FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid) INTO already;
  IF already THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid;
    UPDATE public.community_posts SET likes_count = greatest(0, likes_count - 1) WHERE id = p_post_id;
    RETURN false;
  ELSE
    INSERT INTO public.post_likes(post_id, user_id) VALUES (p_post_id, v_uid);
    UPDATE public.community_posts SET likes_count = likes_count + 1 WHERE id = p_post_id;
    RETURN true;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION recording_private.bucket_ready()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='voice-notes' AND NOT b.public AND coalesce(to_jsonb(b)->>'versioning_status','DISABLED')='DISABLED')
$function$
;

CREATE OR REPLACE FUNCTION recording_private.metadata_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 UPDATE recording_private.operations SET state=CASE WHEN object_path IS NULL THEN 'blocked' ELSE 'deleting' END,lease_token=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE id=OLD.recording_operation_id AND state NOT IN ('deleted','deleting');
 RETURN OLD;
END$function$
;

CREATE OR REPLACE FUNCTION recording_private.metadata_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'title') IS DISTINCT FROM (to_jsonb(OLD)-'title') THEN RAISE EXCEPTION 'Recording metadata identity is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.recording_operation_id IS NULL THEN RAISE EXCEPTION 'A durable recording operation is required'; END IF;
 SELECT * INTO o FROM recording_private.operations WHERE id=NEW.recording_operation_id FOR UPDATE;
 IF NOT FOUND OR o.state<>'published' OR o.note_id<>NEW.id OR o.owner_id<>NEW.user_id OR o.playback_url IS DISTINCT FROM NEW.audio_url OR o.scope<>(CASE TG_TABLE_NAME WHEN 'voice_notes' THEN 'document' ELSE 'room' END)
 OR o.scope_id IS DISTINCT FROM coalesce(to_jsonb(NEW)->>'document_id',to_jsonb(NEW)->>'room_id') OR (o.scope='document' AND o.document_generation IS DISTINCT FROM (to_jsonb(NEW)->>'document_generation')::uuid) THEN RAISE EXCEPTION 'Recording publication is not authorized'; END IF;
 RETURN NEW;
END$function$
;

CREATE OR REPLACE FUNCTION recording_private.publish(p_id uuid, p_owner uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations; allowed boolean; bytes jsonb;
BEGIN
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id;
 IF p_owner IS NOT NULL AND o.owner_id<>p_owner THEN RAISE EXCEPTION 'Wrong recording owner' USING ERRCODE='42501'; END IF;
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording publication requires a private nonversioned bucket'; END IF;
 -- Parent/member locks precede the operation lock, as they do during upload.
 allowed:=recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,o.document_generation);
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=p_id FOR UPDATE;
 IF p_lease IS NOT NULL AND (o.lease_token IS DISTINCT FROM p_lease OR o.lease_until<=now()) THEN RAISE EXCEPTION 'Stale recording lease'; END IF;
 IF o.state<>'awaiting_upload' THEN RETURN recording_private.reply(o); END IF;
 IF NOT allowed THEN
  UPDATE recording_private.operations SET state='deleting',lease_token=NULL,lease_until=NULL,next_attempt_at=now() WHERE id=o.id RETURNING * INTO o;
  RETURN recording_private.reply(o);
 END IF;
 SELECT metadata INTO bytes FROM storage.objects WHERE bucket_id='voice-notes' AND name=o.object_path;
 IF NOT FOUND THEN
  -- The deadline limits admission of new bytes, not recovery of committed audio.
  -- A worker outage or metadata failure must never expire an uploaded recording.
  IF o.upload_deadline>now() THEN RAISE EXCEPTION 'Recording bytes have not been uploaded'; END IF;
  UPDATE recording_private.operations SET state='deleting',lease_token=NULL,lease_until=NULL,next_attempt_at=now() WHERE id=o.id RETURNING * INTO o;
  RETURN recording_private.reply(o);
 END IF;
 IF (bytes->'size') IS DISTINCT FROM to_jsonb(o.byte_size) OR coalesce(bytes->>'mimetype','')<>o.mime THEN
  -- Retain uncertain bytes for explicit owner deletion or operator reconciliation.
  UPDATE recording_private.operations SET state='blocked',lease_token=NULL,lease_until=NULL,last_error='Uploaded bytes did not match declared size/type; retained for reconciliation' WHERE id=o.id RETURNING * INTO o;
  RETURN recording_private.reply(o);
 END IF;
 UPDATE recording_private.operations SET state='published',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF o.scope='document' THEN
  INSERT INTO public.voice_notes(id,user_id,document_id,document_generation,page_number,duration,title,audio_url,audio_size_bytes,timestamp,recording_operation_id)
  VALUES(o.note_id,o.owner_id,o.scope_id,o.document_generation,o.page_number,o.duration,o.title,o.playback_url,o.byte_size,o.recorded_at,o.id);
 ELSE
  INSERT INTO public.room_voice_notes(id,user_id,room_id,page_number,duration,title,audio_url,timestamp,recording_operation_id)
  VALUES(o.note_id,o.owner_id,o.scope_id::uuid,o.page_number,o.duration,o.title,o.playback_url,o.recorded_at,o.id);
 END IF;
 RETURN recording_private.reply(o);
END$function$
;

CREATE OR REPLACE FUNCTION recording_private.reply(o recording_private.operations)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('id',o.id,'note_id',o.note_id,'state',o.state,'object_path',o.object_path,'audio_url',o.playback_url,'owner_id',o.owner_id,'scope',o.scope,'scope_id',o.scope_id,'document_generation',o.document_generation,'upload_deadline',o.upload_deadline)
$function$
;

CREATE OR REPLACE FUNCTION recording_private.scope_allowed(p_owner uuid, p_scope text, p_scope_id text, p_generation uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_owner FOR KEY SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_scope='document' THEN
  BEGIN PERFORM public.assert_document_generation(p_scope_id,p_generation,p_owner);
  EXCEPTION WHEN SQLSTATE 'PDD01' OR SQLSTATE 'PDD02' OR insufficient_privilege THEN RETURN false; END;
  RETURN true;
 END IF;
 PERFORM 1 FROM public.study_rooms WHERE id=p_scope_id::uuid AND status='active' AND (expires_at IS NULL OR expires_at>now()) FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.room_members WHERE room_id=p_scope_id::uuid AND user_id=p_owner FOR SHARE;
 RETURN FOUND;
END$function$
;

CREATE OR REPLACE FUNCTION recording_private.storage_commit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE o recording_private.operations; live boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.bucket_id='voice-notes' AND (to_jsonb(NEW)-'updated_at'-'last_accessed_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'last_accessed_at') THEN
   RAISE EXCEPTION 'Recording object identity and bytes are immutable';
  END IF;
  IF NEW.bucket_id IS DISTINCT FROM 'voice-notes' OR OLD.bucket_id='voice-notes' THEN RETURN NEW; END IF;
 ELSIF NEW.bucket_id IS DISTINCT FROM 'voice-notes' THEN RETURN NEW;
 END IF;
 IF NOT recording_private.bucket_ready() THEN RAISE EXCEPTION 'Recording Storage commit requires a private nonversioned bucket'; END IF;
 SELECT * INTO o FROM recording_private.operations WHERE object_path=NEW.name AND NOT legacy;
 IF NOT FOUND THEN RAISE EXCEPTION 'A durable recording operation is required for Storage commit'; END IF;
 -- This is deliberately independent of caller JWT/DB role: the Storage final
 -- write runs as admin. The already-accepted owner and scope are authoritative.
 PERFORM 1 FROM auth.users WHERE id=o.owner_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recording account authorization revoked'; END IF;
 IF o.scope='document' THEN
  PERFORM 1 FROM public.documents WHERE id=o.scope_id AND user_id=o.owner_id AND generation=o.document_generation FOR SHARE;
  live:=FOUND;
 ELSE
  live:=recording_private.scope_allowed(o.owner_id,o.scope,o.scope_id,NULL);
 END IF;
 IF NOT live THEN RAISE EXCEPTION 'Recording scope authorization revoked'; END IF;
 SELECT * INTO STRICT o FROM recording_private.operations WHERE id=o.id FOR UPDATE;
 IF o.state<>'awaiting_upload' OR o.upload_deadline<=now() THEN RAISE EXCEPTION 'Recording operation is cancelled, deleted or expired'; END IF;
 RETURN NEW;
END$function$
;

ALTER TABLE public.active_sessions ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.active_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.active_sessions ALTER COLUMN last_seen SET DEFAULT now();

ALTER TABLE public.ai_request_reservations ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.ai_request_reservations ALTER COLUMN expires_at SET DEFAULT (now() + '00:05:00'::interval);

ALTER TABLE public.ai_request_reservations ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.ai_request_reservations ALTER COLUMN status SET DEFAULT 'legacy'::text;

ALTER TABLE public.ai_usage ALTER COLUMN count SET DEFAULT 0;

ALTER TABLE public.billing_checkout_attempts ALTER COLUMN attempt_id SET DEFAULT gen_random_uuid();

ALTER TABLE public.billing_events ALTER COLUMN processed_at SET DEFAULT now();

ALTER TABLE public.blank_pages ALTER COLUMN bg_theme SET DEFAULT 'white'::text;

ALTER TABLE public.blank_pages ALTER COLUMN images SET DEFAULT '[]'::jsonb;

ALTER TABLE public.bookmarks ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.community_posts ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.community_posts ALTER COLUMN description SET DEFAULT ''::text;

ALTER TABLE public.community_posts ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.community_posts ALTER COLUMN likes_count SET DEFAULT 0;

ALTER TABLE public.community_posts ALTER COLUMN pages SET DEFAULT '[]'::jsonb;

ALTER TABLE public.community_posts ALTER COLUMN tags SET DEFAULT '{}'::text[];

ALTER TABLE public.community_posts ALTER COLUMN title SET DEFAULT ''::text;

ALTER TABLE public.direct_messages ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.direct_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.direct_messages ALTER COLUMN read SET DEFAULT false;

ALTER TABLE public.document_collection_revisions ALTER COLUMN page_key SET DEFAULT ''::text;

ALTER TABLE public.document_collection_revisions ALTER COLUMN revision SET DEFAULT 0;

ALTER TABLE public.document_favorites ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.document_owner_epochs ALTER COLUMN revision SET DEFAULT 0;

ALTER TABLE public.document_tags ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.document_tags ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.documents ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.documents ALTER COLUMN generation SET DEFAULT gen_random_uuid();

ALTER TABLE public.documents ALTER COLUMN type SET DEFAULT 'pdf'::text;

ALTER TABLE public.documents ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.drawings ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.flashcard_decks ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.flashcard_decks ALTER COLUMN description SET DEFAULT ''::text;

ALTER TABLE public.flashcard_decks ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.flashcard_decks ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.flashcards ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.flashcards ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.flashcards ALTER COLUMN interval_days SET DEFAULT 0;

ALTER TABLE public.flashcards ALTER COLUMN next_review_at SET DEFAULT now();

ALTER TABLE public.flashcards ALTER COLUMN review_count SET DEFAULT 0;

ALTER TABLE public.follows ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.friendships ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.friendships ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.friendships ALTER COLUMN status SET DEFAULT 'pending'::text;

ALTER TABLE public.key_terms ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.notifications ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.notifications ALTER COLUMN data SET DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.notifications ALTER COLUMN read SET DEFAULT false;

ALTER TABLE public.office_certificates ALTER COLUMN color SET DEFAULT 'ink'::text;

ALTER TABLE public.office_certificates ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_certificates ALTER COLUMN credential_id SET DEFAULT ''::text;

ALTER TABLE public.office_certificates ALTER COLUMN date_label SET DEFAULT ''::text;

ALTER TABLE public.office_certificates ALTER COLUMN description SET DEFAULT ''::text;

ALTER TABLE public.office_certificates ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_certificates ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_certificates ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_cv_skills ALTER COLUMN category SET DEFAULT ''::text;

ALTER TABLE public.office_cv_skills ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_cv_skills ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_cv_skills ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_cv_skills ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_education ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_education ALTER COLUMN note SET DEFAULT ''::text;

ALTER TABLE public.office_education ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_experiences ALTER COLUMN achievements SET DEFAULT '{}'::text[];

ALTER TABLE public.office_experiences ALTER COLUMN description SET DEFAULT ''::text;

ALTER TABLE public.office_experiences ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_experiences ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_files ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_files ALTER COLUMN favorite SET DEFAULT false;

ALTER TABLE public.office_files ALTER COLUMN format SET DEFAULT 'FILE'::text;

ALTER TABLE public.office_files ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_files ALTER COLUMN mime_type SET DEFAULT 'application/octet-stream'::text;

ALTER TABLE public.office_files ALTER COLUMN size_bytes SET DEFAULT 0;

ALTER TABLE public.office_files ALTER COLUMN type_label SET DEFAULT 'Document'::text;

ALTER TABLE public.office_files ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_ideas ALTER COLUMN category SET DEFAULT ''::text;

ALTER TABLE public.office_ideas ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_ideas ALTER COLUMN date_label SET DEFAULT ''::text;

ALTER TABLE public.office_ideas ALTER COLUMN description SET DEFAULT ''::text;

ALTER TABLE public.office_ideas ALTER COLUMN favorite SET DEFAULT false;

ALTER TABLE public.office_ideas ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_ideas ALTER COLUMN notes SET DEFAULT '{}'::jsonb;

ALTER TABLE public.office_ideas ALTER COLUMN status SET DEFAULT 'New'::text;

ALTER TABLE public.office_ideas ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_languages ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_languages ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_languages ALTER COLUMN proficiency SET DEFAULT ''::text;

ALTER TABLE public.office_languages ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_languages ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_learning_tracks ALTER COLUMN category SET DEFAULT ''::text;

ALTER TABLE public.office_learning_tracks ALTER COLUMN color SET DEFAULT 'olive'::text;

ALTER TABLE public.office_learning_tracks ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_learning_tracks ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_learning_tracks ALTER COLUMN next_focus SET DEFAULT ''::text;

ALTER TABLE public.office_learning_tracks ALTER COLUMN progress SET DEFAULT 0;

ALTER TABLE public.office_learning_tracks ALTER COLUMN sessions SET DEFAULT 0;

ALTER TABLE public.office_learning_tracks ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_learning_tracks ALTER COLUMN target SET DEFAULT 100;

ALTER TABLE public.office_learning_tracks ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_nodes ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_nodes ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_nodes ALTER COLUMN item_count SET DEFAULT 0;

ALTER TABLE public.office_nodes ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_nodes ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_notes ALTER COLUMN category SET DEFAULT ''::text;

ALTER TABLE public.office_notes ALTER COLUMN content SET DEFAULT '{}'::jsonb;

ALTER TABLE public.office_notes ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_notes ALTER COLUMN excerpt SET DEFAULT ''::text;

ALTER TABLE public.office_notes ALTER COLUMN favorite SET DEFAULT false;

ALTER TABLE public.office_notes ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_notes ALTER COLUMN plain_text SET DEFAULT ''::text;

ALTER TABLE public.office_notes ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_profiles ALTER COLUMN availability SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN bio SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_profiles ALTER COLUMN current_focus SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN email SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN goals SET DEFAULT '{}'::text[];

ALTER TABLE public.office_profiles ALTER COLUMN location SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN name SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN office_name SET DEFAULT 'My Office'::text;

ALTER TABLE public.office_profiles ALTER COLUMN practice SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN private_by_default SET DEFAULT true;

ALTER TABLE public.office_profiles ALTER COLUMN skills SET DEFAULT '{}'::text[];

ALTER TABLE public.office_profiles ALTER COLUMN statement SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN title SET DEFAULT ''::text;

ALTER TABLE public.office_profiles ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_profiles ALTER COLUMN week_starts_on SET DEFAULT 'Monday'::text;

ALTER TABLE public.office_profiles ALTER COLUMN working_since SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN category SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.office_projects ALTER COLUMN description SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN featured SET DEFAULT false;

ALTER TABLE public.office_projects ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.office_projects ALTER COLUMN problem SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN result SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN role SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN solution SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.office_projects ALTER COLUMN status SET DEFAULT ''::text;

ALTER TABLE public.office_projects ALTER COLUMN technologies SET DEFAULT '{}'::text[];

ALTER TABLE public.office_projects ALTER COLUMN tone SET DEFAULT 'sage'::text;

ALTER TABLE public.office_projects ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.office_projects ALTER COLUMN year SET DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer;

ALTER TABLE public.page_image_annotations ALTER COLUMN images SET DEFAULT '[]'::jsonb;

ALTER TABLE public.page_image_annotations ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.post_comments ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.post_comments ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.post_likes ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.profiles ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.profiles ALTER COLUMN is_vip SET DEFAULT false;

ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'free'::text;

ALTER TABLE public.referrals ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.referrals ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.referrals ALTER COLUMN reward_granted SET DEFAULT false;

ALTER TABLE public.room_blank_pages ALTER COLUMN bg_theme SET DEFAULT 'white'::text;

ALTER TABLE public.room_blank_pages ALTER COLUMN insert_after_page SET DEFAULT 0;

ALTER TABLE public.room_document_events ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.room_drawings ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.room_invitations ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.room_invitations ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.room_invitations ALTER COLUMN status SET DEFAULT 'pending'::text;

ALTER TABLE public.room_members ALTER COLUMN joined_at SET DEFAULT now();

ALTER TABLE public.room_strokes ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.room_strokes ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.room_strokes ALTER COLUMN seq SET DEFAULT nextval('room_strokes_seq_seq'::regclass);

ALTER TABLE public.room_voice_notes ALTER COLUMN duration SET DEFAULT 0;

ALTER TABLE public.room_voice_notes ALTER COLUMN page_number SET DEFAULT '1'::text;

ALTER TABLE public.room_voice_notes ALTER COLUMN "timestamp" SET DEFAULT now();

ALTER TABLE public.session_state ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.session_state ALTER COLUMN virtual_index SET DEFAULT 0;

ALTER TABLE public.study_rooms ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.study_rooms ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.study_rooms ALTER COLUMN max_members SET DEFAULT 10;

ALTER TABLE public.study_rooms ALTER COLUMN status SET DEFAULT 'active'::text;

ALTER TABLE public.study_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.study_sessions ALTER COLUMN started_at SET DEFAULT now();

ALTER TABLE public.subscriptions ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.subscriptions ALTER COLUMN plan SET DEFAULT 'free'::text;

ALTER TABLE public.subscriptions ALTER COLUMN status SET DEFAULT 'active'::text;

ALTER TABLE public.subscriptions ALTER COLUMN stripe_event_created SET DEFAULT 0;

ALTER TABLE public.subscriptions ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.text_notes ALTER COLUMN color SET DEFAULT '#1a1a1a'::text;

ALTER TABLE public.text_notes ALTER COLUMN content SET DEFAULT ''::text;

ALTER TABLE public.text_notes ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.text_notes ALTER COLUMN font_size SET DEFAULT 13;

ALTER TABLE public.user_preferences ALTER COLUMN accent_color SET DEFAULT 'Blue'::text;

ALTER TABLE public.user_preferences ALTER COLUMN default_bg SET DEFAULT 'dark'::text;

ALTER TABLE public.user_preferences ALTER COLUMN default_zoom SET DEFAULT 100;

ALTER TABLE public.user_preferences ALTER COLUMN font_family SET DEFAULT 'default'::text;

ALTER TABLE public.user_preferences ALTER COLUMN font_size SET DEFAULT 'medium'::text;

ALTER TABLE public.user_preferences ALTER COLUMN notif_room_join SET DEFAULT true;

ALTER TABLE public.user_preferences ALTER COLUMN theme SET DEFAULT 'dark'::text;

ALTER TABLE public.user_preferences ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.user_preferences ALTER COLUMN view_mode SET DEFAULT 'page'::text;

ALTER TABLE public.user_settings ALTER COLUMN community_visibility SET DEFAULT 'everyone'::text;

ALTER TABLE public.user_settings ALTER COLUMN daily_study_goal_hours SET DEFAULT 2;

ALTER TABLE public.user_settings ALTER COLUMN language SET DEFAULT 'en'::text;

ALTER TABLE public.user_settings ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.voice_notes ALTER COLUMN audio_size_bytes SET DEFAULT 0;

ALTER TABLE public.voice_notes ALTER COLUMN duration SET DEFAULT 0;

ALTER TABLE public.voice_notes ALTER COLUMN "timestamp" SET DEFAULT now();

ALTER TABLE reconcile_archive.document_children_20261120 ALTER COLUMN archived_at SET DEFAULT now();

ALTER TABLE recording_private.operations ALTER COLUMN attempts SET DEFAULT 0;

ALTER TABLE recording_private.operations ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE recording_private.operations ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE recording_private.operations ALTER COLUMN legacy SET DEFAULT false;

ALTER TABLE recording_private.operations ALTER COLUMN next_attempt_at SET DEFAULT now();

ALTER TABLE recording_private.operations ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE recording_private.operations ALTER COLUMN upload_deadline SET DEFAULT (now() + '01:00:00'::interval);

ALTER TABLE worker_private.recording_worker_token ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE worker_private.recording_worker_token ALTER COLUMN id SET DEFAULT 1;

ALTER TABLE worker_private.recording_worker_token ALTER COLUMN token SET DEFAULT replace(((gen_random_uuid())::text || (gen_random_uuid())::text), '-'::text, ''::text);

ALTER SEQUENCE public.room_strokes_seq_seq OWNED BY public.room_strokes.seq;

ALTER TABLE public.active_sessions ADD CONSTRAINT active_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.active_sessions ADD CONSTRAINT active_sessions_user_id_key UNIQUE (user_id);

ALTER TABLE public.ai_request_reservations ADD CONSTRAINT ai_request_reservations_pkey PRIMARY KEY (id);

ALTER TABLE public.ai_request_reservations ADD CONSTRAINT ai_request_reservations_status_check CHECK ((status = ANY (ARRAY['legacy'::text, 'pending'::text, 'completed'::text])));

ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (user_id, month);

ALTER TABLE public.billing_checkout_attempts ADD CONSTRAINT billing_checkout_attempts_pkey PRIMARY KEY (user_id);

ALTER TABLE public.billing_checkout_attempts ADD CONSTRAINT billing_checkout_attempts_billing_check CHECK ((billing = ANY (ARRAY['monthly'::text, 'yearly'::text])));

ALTER TABLE public.billing_checkout_attempts ADD CONSTRAINT billing_checkout_attempts_plan_check CHECK ((plan = ANY (ARRAY['premium'::text, 'pro'::text])));

ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_pkey PRIMARY KEY (event_id);

ALTER TABLE public.billing_reconciliation_leases ADD CONSTRAINT billing_reconciliation_leases_pkey PRIMARY KEY (subscription_id);

ALTER TABLE public.blank_pages ADD CONSTRAINT blank_pages_pkey PRIMARY KEY (id);

ALTER TABLE public.bookmarks ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);

ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);

ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_content_max_4000 CHECK ((length(content) <= 4000));

ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_content_nonempty CHECK ((length(btrim(content)) > 0));

ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_no_self_message CHECK ((sender_id <> recipient_id));

ALTER TABLE public.document_collection_receipts ADD CONSTRAINT document_collection_receipts_pkey PRIMARY KEY (user_id, write_id);

ALTER TABLE public.document_collection_revisions ADD CONSTRAINT document_collection_revisions_pkey PRIMARY KEY (user_id, document_id, generation, collection, page_key);

ALTER TABLE public.document_favorites ADD CONSTRAINT document_favorites_pkey PRIMARY KEY (user_id, document_id);

ALTER TABLE public.document_lifetimes ADD CONSTRAINT document_lifetimes_pkey PRIMARY KEY (document_id);

ALTER TABLE public.document_lifetimes ADD CONSTRAINT document_lifetimes_document_id_user_id_generation_key UNIQUE (document_id, user_id, generation);

ALTER TABLE public.document_owner_epochs ADD CONSTRAINT document_owner_epochs_pkey PRIMARY KEY (user_id);

ALTER TABLE public.document_tags ADD CONSTRAINT document_tags_pkey PRIMARY KEY (id);

ALTER TABLE public.document_tags ADD CONSTRAINT document_tags_user_id_document_id_tag_key UNIQUE (user_id, document_id, tag);

ALTER TABLE public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

ALTER TABLE public.documents ADD CONSTRAINT documents_owner_generation_unique UNIQUE (id, user_id, generation);

ALTER TABLE public.documents ADD CONSTRAINT documents_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE public.drawings ADD CONSTRAINT drawings_pkey PRIMARY KEY (id);

ALTER TABLE public.drawings ADD CONSTRAINT drawings_user_id_document_id_page_key_key UNIQUE (user_id, document_id, page_key);

ALTER TABLE public.flashcard_decks ADD CONSTRAINT flashcard_decks_pkey PRIMARY KEY (id);

ALTER TABLE public.flashcard_decks ADD CONSTRAINT flashcard_decks_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)));

ALTER TABLE public.flashcards ADD CONSTRAINT flashcards_pkey PRIMARY KEY (id);

ALTER TABLE public.flashcards ADD CONSTRAINT flashcards_interval_days_check CHECK ((interval_days >= 0));

ALTER TABLE public.flashcards ADD CONSTRAINT flashcards_review_count_check CHECK ((review_count >= 0));

ALTER TABLE public.follows ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);

ALTER TABLE public.friendships ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);

ALTER TABLE public.friendships ADD CONSTRAINT unique_friendship UNIQUE (requester_id, receiver_id);

ALTER TABLE public.friendships ADD CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])));

ALTER TABLE public.key_terms ADD CONSTRAINT key_terms_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.office_certificates ADD CONSTRAINT office_certificates_pkey PRIMARY KEY (id);

ALTER TABLE public.office_certificates ADD CONSTRAINT office_certificates_user_id_name_issuer_key UNIQUE (user_id, name, issuer);

ALTER TABLE public.office_cv_skills ADD CONSTRAINT office_cv_skills_pkey PRIMARY KEY (id);

ALTER TABLE public.office_education ADD CONSTRAINT office_education_pkey PRIMARY KEY (id);

ALTER TABLE public.office_education ADD CONSTRAINT office_education_user_id_institution_degree_key UNIQUE (user_id, institution, degree);

ALTER TABLE public.office_experiences ADD CONSTRAINT office_experiences_pkey PRIMARY KEY (id);

ALTER TABLE public.office_experiences ADD CONSTRAINT office_experiences_user_id_company_role_key UNIQUE (user_id, company, role);

ALTER TABLE public.office_files ADD CONSTRAINT office_files_pkey PRIMARY KEY (id);

ALTER TABLE public.office_files ADD CONSTRAINT office_files_user_id_storage_path_key UNIQUE (user_id, storage_path);

ALTER TABLE public.office_files ADD CONSTRAINT office_files_size_bytes_check CHECK ((size_bytes >= 0));

ALTER TABLE public.office_ideas ADD CONSTRAINT office_ideas_pkey PRIMARY KEY (id);

ALTER TABLE public.office_ideas ADD CONSTRAINT office_ideas_user_id_title_key UNIQUE (user_id, title);

ALTER TABLE public.office_ideas ADD CONSTRAINT office_ideas_status_check CHECK ((status = ANY (ARRAY['New'::text, 'Thinking'::text, 'Developing'::text, 'Completed'::text])));

ALTER TABLE public.office_languages ADD CONSTRAINT office_languages_pkey PRIMARY KEY (id);

ALTER TABLE public.office_learning_tracks ADD CONSTRAINT office_learning_tracks_pkey PRIMARY KEY (id);

ALTER TABLE public.office_learning_tracks ADD CONSTRAINT office_learning_tracks_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE public.office_learning_tracks ADD CONSTRAINT office_learning_tracks_progress_check CHECK (((progress >= 0) AND (progress <= 100)));

ALTER TABLE public.office_learning_tracks ADD CONSTRAINT office_learning_tracks_sessions_check CHECK ((sessions >= 0));

ALTER TABLE public.office_learning_tracks ADD CONSTRAINT office_learning_tracks_target_check CHECK (((target >= 0) AND (target <= 100)));

ALTER TABLE public.office_nodes ADD CONSTRAINT office_nodes_pkey PRIMARY KEY (id);

ALTER TABLE public.office_nodes ADD CONSTRAINT office_nodes_user_id_parent_id_name_key UNIQUE (user_id, parent_id, name);

ALTER TABLE public.office_nodes ADD CONSTRAINT office_nodes_item_count_check CHECK ((item_count >= 0));

ALTER TABLE public.office_nodes ADD CONSTRAINT office_nodes_kind_check CHECK ((kind = ANY (ARRAY['space'::text, 'folder'::text, 'note'::text, 'file'::text, 'link'::text])));

ALTER TABLE public.office_notes ADD CONSTRAINT office_notes_pkey PRIMARY KEY (id);

ALTER TABLE public.office_notes ADD CONSTRAINT office_notes_user_id_title_key UNIQUE (user_id, title);

ALTER TABLE public.office_profiles ADD CONSTRAINT office_profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.office_profiles ADD CONSTRAINT office_profiles_week_starts_on_check CHECK ((week_starts_on = ANY (ARRAY['Monday'::text, 'Sunday'::text])));

ALTER TABLE public.office_projects ADD CONSTRAINT office_projects_pkey PRIMARY KEY (id);

ALTER TABLE public.office_projects ADD CONSTRAINT office_projects_user_id_slug_key UNIQUE (user_id, slug);

ALTER TABLE public.page_image_annotations ADD CONSTRAINT page_image_annotations_pkey PRIMARY KEY (user_id, document_id, page_number);

ALTER TABLE public.post_comments ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);

ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_handle_format CHECK (((handle = lower(handle)) AND (handle ~ '^[a-z0-9_]{3,24}$'::text)));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'premium'::text, 'pro'::text])));

ALTER TABLE public.referrals ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);

ALTER TABLE public.referrals ADD CONSTRAINT referrals_referrer_id_referred_id_key UNIQUE (referrer_id, referred_id);

ALTER TABLE public.room_blank_pages ADD CONSTRAINT room_blank_pages_pkey PRIMARY KEY (id);

ALTER TABLE public.room_document_events ADD CONSTRAINT room_document_events_pkey PRIMARY KEY (id);

ALTER TABLE public.room_document_events ADD CONSTRAINT room_document_events_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 255)));

ALTER TABLE public.room_drawings ADD CONSTRAINT room_drawings_pkey PRIMARY KEY (room_id, page_number);

ALTER TABLE public.room_invitations ADD CONSTRAINT room_invitations_pkey PRIMARY KEY (id);

ALTER TABLE public.room_invitations ADD CONSTRAINT room_invitations_room_id_invitee_id_key UNIQUE (room_id, invitee_id);

ALTER TABLE public.room_invitations ADD CONSTRAINT room_invitations_check CHECK ((inviter_id <> invitee_id));

ALTER TABLE public.room_invitations ADD CONSTRAINT room_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])));

ALTER TABLE public.room_members ADD CONSTRAINT room_members_pkey PRIMARY KEY (room_id, user_id);

ALTER TABLE public.room_strokes ADD CONSTRAINT room_strokes_pkey PRIMARY KEY (id);

ALTER TABLE public.room_voice_notes ADD CONSTRAINT room_voice_notes_pkey PRIMARY KEY (id);

ALTER TABLE public.session_state ADD CONSTRAINT session_state_pkey PRIMARY KEY (user_id);

ALTER TABLE public.study_rooms ADD CONSTRAINT study_rooms_pkey PRIMARY KEY (id);

ALTER TABLE public.study_rooms ADD CONSTRAINT study_rooms_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])));

ALTER TABLE public.study_sessions ADD CONSTRAINT study_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'premium'::text, 'pro'::text])));

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['incomplete'::text, 'incomplete_expired'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'unpaid'::text, 'paused'::text])));

ALTER TABLE public.text_notes ADD CONSTRAINT text_notes_pkey PRIMARY KEY (id);

ALTER TABLE public.text_notes ADD CONSTRAINT text_notes_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['important'::text, 'review'::text, 'idea'::text]))));

ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);

ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);

ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_pkey PRIMARY KEY (id);

ALTER TABLE recording_private.operations ADD CONSTRAINT operations_pkey PRIMARY KEY (id);

ALTER TABLE recording_private.operations ADD CONSTRAINT operations_note_id_key UNIQUE (note_id);

ALTER TABLE recording_private.operations ADD CONSTRAINT operations_object_path_key UNIQUE (object_path);

ALTER TABLE recording_private.operations ADD CONSTRAINT operations_byte_size_check CHECK ((byte_size >= 0));

ALTER TABLE recording_private.operations ADD CONSTRAINT operations_scope_check CHECK ((scope = ANY (ARRAY['document'::text, 'room'::text])));

ALTER TABLE recording_private.operations ADD CONSTRAINT operations_state_check CHECK ((state = ANY (ARRAY['awaiting_upload'::text, 'published'::text, 'deleting'::text, 'deleted'::text, 'blocked'::text])));

ALTER TABLE worker_private.recording_worker_token ADD CONSTRAINT recording_worker_token_pkey PRIMARY KEY (id);

ALTER TABLE worker_private.recording_worker_token ADD CONSTRAINT recording_worker_token_id_check CHECK ((id = 1));

ALTER TABLE public.active_sessions ADD CONSTRAINT active_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.ai_request_reservations ADD CONSTRAINT ai_request_reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.billing_checkout_attempts ADD CONSTRAINT billing_checkout_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.blank_pages ADD CONSTRAINT blank_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.blank_pages ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.bookmarks ADD CONSTRAINT bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.bookmarks ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.community_posts ADD CONSTRAINT community_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.community_posts ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE SET NULL (document_id, document_generation);

ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.document_favorites ADD CONSTRAINT document_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.document_favorites ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.document_tags ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.document_tags ADD CONSTRAINT document_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.documents ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.drawings ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.drawings ADD CONSTRAINT drawings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.flashcard_decks ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (doc_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE SET NULL (doc_id, document_generation);

ALTER TABLE public.flashcard_decks ADD CONSTRAINT flashcard_decks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.flashcards ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (doc_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.flashcards ADD CONSTRAINT flashcards_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE;

ALTER TABLE public.flashcards ADD CONSTRAINT flashcards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.follows ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.friendships ADD CONSTRAINT friendships_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.friendships ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.key_terms ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.key_terms ADD CONSTRAINT key_terms_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_certificates ADD CONSTRAINT office_certificates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_cv_skills ADD CONSTRAINT office_cv_skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_education ADD CONSTRAINT office_education_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_experiences ADD CONSTRAINT office_experiences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_files ADD CONSTRAINT office_files_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES office_certificates(id) ON DELETE SET NULL;

ALTER TABLE public.office_files ADD CONSTRAINT office_files_node_id_fkey FOREIGN KEY (node_id) REFERENCES office_nodes(id) ON DELETE SET NULL;

ALTER TABLE public.office_files ADD CONSTRAINT office_files_note_id_fkey FOREIGN KEY (note_id) REFERENCES office_notes(id) ON DELETE SET NULL;

ALTER TABLE public.office_files ADD CONSTRAINT office_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES office_projects(id) ON DELETE SET NULL;

ALTER TABLE public.office_files ADD CONSTRAINT office_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_ideas ADD CONSTRAINT office_ideas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_languages ADD CONSTRAINT office_languages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_learning_tracks ADD CONSTRAINT office_learning_tracks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_nodes ADD CONSTRAINT office_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES office_nodes(id) ON DELETE CASCADE;

ALTER TABLE public.office_nodes ADD CONSTRAINT office_nodes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_notes ADD CONSTRAINT office_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_profiles ADD CONSTRAINT office_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.office_projects ADD CONSTRAINT office_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.page_image_annotations ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.page_image_annotations ADD CONSTRAINT page_image_annotations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.post_comments ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

ALTER TABLE public.post_comments ADD CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.referrals ADD CONSTRAINT referrals_referred_id_fkey FOREIGN KEY (referred_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.referrals ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.room_blank_pages ADD CONSTRAINT room_blank_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.room_blank_pages ADD CONSTRAINT room_blank_pages_room_id_fkey FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.room_document_events ADD CONSTRAINT room_document_events_room_id_fkey FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.room_document_events ADD CONSTRAINT room_document_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.room_drawings ADD CONSTRAINT room_drawings_room_id_fkey FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.room_invitations ADD CONSTRAINT room_invitations_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.room_invitations ADD CONSTRAINT room_invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.room_invitations ADD CONSTRAINT room_invitations_room_id_fkey FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.room_members ADD CONSTRAINT room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.room_members ADD CONSTRAINT room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.room_strokes ADD CONSTRAINT room_strokes_room_id_fkey FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.room_strokes ADD CONSTRAINT room_strokes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.room_voice_notes ADD CONSTRAINT room_voice_notes_recording_operation_id_fkey FOREIGN KEY (recording_operation_id) REFERENCES recording_private.operations(id);

ALTER TABLE public.room_voice_notes ADD CONSTRAINT room_voice_notes_room_id_fkey FOREIGN KEY (room_id) REFERENCES study_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.room_voice_notes ADD CONSTRAINT room_voice_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.session_state ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (doc_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE SET NULL (doc_id, document_generation);

ALTER TABLE public.session_state ADD CONSTRAINT session_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.study_rooms ADD CONSTRAINT study_rooms_host_user_id_fkey FOREIGN KEY (host_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.study_sessions ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE SET NULL (document_id, document_generation);

ALTER TABLE public.study_sessions ADD CONSTRAINT study_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.text_notes ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.text_notes ADD CONSTRAINT text_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.voice_notes ADD CONSTRAINT document_generation_parent_fk FOREIGN KEY (document_id, user_id, document_generation) REFERENCES documents(id, user_id, generation) ON DELETE CASCADE;

ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_recording_operation_id_fkey FOREIGN KEY (recording_operation_id) REFERENCES recording_private.operations(id);

ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX ai_pending_expiry ON public.ai_request_reservations USING btree (user_id, expires_at) WHERE (status = 'pending'::text);

CREATE INDEX blank_pages_document_id_user_id_document_generation_idx ON public.blank_pages USING btree (document_id, user_id, document_generation);

CREATE INDEX bookmarks_document_id_user_id_document_generation_idx ON public.bookmarks USING btree (document_id, user_id, document_generation);

CREATE INDEX community_posts_document_id_user_id_document_generation_idx ON public.community_posts USING btree (document_id, user_id, document_generation);

CREATE INDEX direct_messages_pair_rs ON public.direct_messages USING btree (recipient_id, sender_id, created_at DESC);

CREATE INDEX direct_messages_pair_sr ON public.direct_messages USING btree (sender_id, recipient_id, created_at DESC);

CREATE INDEX direct_messages_unread ON public.direct_messages USING btree (recipient_id, sender_id) WHERE (read = false);

CREATE INDEX document_favorites_document_id_user_id_document_generation_idx ON public.document_favorites USING btree (document_id, user_id, document_generation);

CREATE INDEX document_tags_document_id_user_id_document_generation_idx ON public.document_tags USING btree (document_id, user_id, document_generation);

CREATE INDEX documents_owner_quota_idx ON public.documents USING btree (user_id);

CREATE INDEX drawings_document_id_user_id_document_generation_idx ON public.drawings USING btree (document_id, user_id, document_generation);

CREATE INDEX flashcard_decks_doc_id_user_id_document_generation_idx ON public.flashcard_decks USING btree (doc_id, user_id, document_generation);

CREATE INDEX flashcard_decks_user_updated_idx ON public.flashcard_decks USING btree (user_id, updated_at DESC);

CREATE INDEX flashcards_deck_review_idx ON public.flashcards USING btree (deck_id, next_review_at);

CREATE INDEX flashcards_doc_id_user_id_document_generation_idx ON public.flashcards USING btree (doc_id, user_id, document_generation);

CREATE INDEX flashcards_user_doc_idx ON public.flashcards USING btree (user_id, doc_id);

CREATE INDEX idx_active_sessions_user_id ON public.active_sessions USING btree (user_id);

CREATE INDEX key_terms_document_id_user_id_document_generation_idx ON public.key_terms USING btree (document_id, user_id, document_generation);

CREATE INDEX office_cv_skills_user_idx ON public.office_cv_skills USING btree (user_id, sort_order);

CREATE INDEX office_files_certificate_fk_idx ON public.office_files USING btree (certificate_id) WHERE (certificate_id IS NOT NULL);

CREATE INDEX office_files_node_fk_idx ON public.office_files USING btree (node_id) WHERE (node_id IS NOT NULL);

CREATE INDEX office_files_note_fk_idx ON public.office_files USING btree (note_id) WHERE (note_id IS NOT NULL);

CREATE INDEX office_files_project_fk_idx ON public.office_files USING btree (project_id) WHERE (project_id IS NOT NULL);

CREATE INDEX office_files_user_idx ON public.office_files USING btree (user_id, updated_at DESC);

CREATE INDEX office_ideas_user_idx ON public.office_ideas USING btree (user_id, updated_at DESC);

CREATE INDEX office_languages_user_idx ON public.office_languages USING btree (user_id, sort_order);

CREATE INDEX office_nodes_parent_fk_idx ON public.office_nodes USING btree (parent_id) WHERE (parent_id IS NOT NULL);

CREATE INDEX office_nodes_parent_idx ON public.office_nodes USING btree (user_id, parent_id, sort_order);

CREATE INDEX office_notes_search_idx ON public.office_notes USING gin (to_tsvector('english'::regconfig, ((title || ' '::text) || plain_text)));

CREATE INDEX office_notes_user_idx ON public.office_notes USING btree (user_id, updated_at DESC);

CREATE INDEX office_projects_search_idx ON public.office_projects USING gin (to_tsvector('english'::regconfig, ((title || ' '::text) || description)));

CREATE INDEX office_projects_user_idx ON public.office_projects USING btree (user_id, updated_at DESC);

CREATE INDEX page_image_annotations_document_id_user_id_document_generat_idx ON public.page_image_annotations USING btree (document_id, user_id, document_generation);

CREATE UNIQUE INDEX profiles_handle_lower_key ON public.profiles USING btree (lower(handle));

CREATE UNIQUE INDEX referrals_one_redemption_per_user ON public.referrals USING btree (referred_id);

CREATE INDEX referrals_referred_idx ON public.referrals USING btree (referred_id);

CREATE INDEX referrals_referrer_idx ON public.referrals USING btree (referrer_id);

CREATE INDEX room_document_events_room_created_idx ON public.room_document_events USING btree (room_id, created_at DESC);

CREATE INDEX room_invitations_invitee_status_idx ON public.room_invitations USING btree (invitee_id, status, expires_at);

CREATE INDEX room_strokes_room_page_seq_idx ON public.room_strokes USING btree (room_id, page_key, seq);

CREATE INDEX room_strokes_room_seq_idx ON public.room_strokes USING btree (room_id, seq);

CREATE UNIQUE INDEX room_voice_notes_recording_operation ON public.room_voice_notes USING btree (recording_operation_id);

CREATE INDEX room_voice_notes_room_id_idx ON public.room_voice_notes USING btree (room_id);

CREATE INDEX session_state_doc_id_user_id_document_generation_idx ON public.session_state USING btree (doc_id, user_id, document_generation);

CREATE INDEX study_sessions_document_id_user_id_document_generation_idx ON public.study_sessions USING btree (document_id, user_id, document_generation);

CREATE INDEX subscriptions_stripe_customer_id_idx ON public.subscriptions USING btree (stripe_customer_id);

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions USING btree (user_id);

CREATE INDEX text_notes_document_id_user_id_document_generation_idx ON public.text_notes USING btree (document_id, user_id, document_generation);

CREATE INDEX voice_notes_document_id_user_id_document_generation_idx ON public.voice_notes USING btree (document_id, user_id, document_generation);

CREATE UNIQUE INDEX voice_notes_recording_operation ON public.voice_notes USING btree (recording_operation_id);

CREATE INDEX recording_operations_ready ON recording_private.operations USING btree (next_attempt_at, created_at) WHERE (state = ANY (ARRAY['awaiting_upload'::text, 'deleting'::text]));

CREATE OR REPLACE VIEW public.document_tombstones WITH (security_invoker=true) AS
 SELECT document_id,
    user_id,
    generation,
    deleted_at
   FROM document_lifetimes
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE VIEW recording_private.untracked_audio_inventory AS
 SELECT name,
    metadata
   FROM storage.objects s
  WHERE bucket_id = 'voice-notes'::text AND NOT (EXISTS ( SELECT 1
           FROM recording_private.operations o
          WHERE o.object_path = s.name));

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON blank_pages FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON blank_pages FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON bookmarks FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON bookmarks FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER direct_messages_create_notification AFTER INSERT ON direct_messages FOR EACH ROW EXECUTE FUNCTION create_direct_message_notification();

CREATE TRIGGER direct_messages_lock_immutable_cols BEFORE UPDATE ON direct_messages FOR EACH ROW EXECUTE FUNCTION direct_messages_lock_immutable_cols();

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON document_favorites FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON document_favorites FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON document_tags FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON document_tags FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER document_lifetime_change BEFORE DELETE OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION guard_document_lifetime();

CREATE TRIGGER document_lifetime_insert AFTER INSERT ON documents FOR EACH ROW EXECUTE FUNCTION guard_document_lifetime();

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON drawings FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON drawings FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON flashcard_decks FOR EACH ROW EXECUTE FUNCTION guard_document_child('doc_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON flashcard_decks FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('doc_id');

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON flashcards FOR EACH ROW EXECUTE FUNCTION guard_document_child('doc_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON flashcards FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('doc_id');

CREATE TRIGGER friendships_create_accepted_notification AFTER UPDATE ON friendships FOR EACH ROW EXECUTE FUNCTION create_friend_accepted_notification();

CREATE TRIGGER friendships_create_request_notification AFTER INSERT ON friendships FOR EACH ROW EXECUTE FUNCTION create_friend_request_notification();

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON key_terms FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON key_terms FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER office_certificates_updated_at BEFORE UPDATE ON office_certificates FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_cv_skills_updated_at BEFORE UPDATE ON office_cv_skills FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_files_updated_at BEFORE UPDATE ON office_files FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_ideas_updated_at BEFORE UPDATE ON office_ideas FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_languages_updated_at BEFORE UPDATE ON office_languages FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_learning_tracks_updated_at BEFORE UPDATE ON office_learning_tracks FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_notes_updated_at BEFORE UPDATE ON office_notes FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_profiles_updated_at BEFORE UPDATE ON office_profiles FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER office_projects_updated_at BEFORE UPDATE ON office_projects FOR EACH ROW EXECUTE FUNCTION office_set_updated_at();

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON page_image_annotations FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON page_image_annotations FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER profiles_lock_privileged_cols BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_lock_privileged_cols();

CREATE TRIGGER recording_metadata_deleted AFTER DELETE ON room_voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_deleted();

CREATE TRIGGER recording_metadata_guard BEFORE INSERT OR UPDATE ON room_voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_guard();

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON session_state FOR EACH ROW EXECUTE FUNCTION guard_document_child('doc_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON session_state FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('doc_id');

CREATE TRIGGER recording_storage_commit_guard BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION recording_private.storage_commit_guard();

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON study_sessions FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON study_sessions FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON text_notes FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON text_notes FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER document_child_guard BEFORE INSERT OR DELETE OR UPDATE ON voice_notes FOR EACH ROW EXECUTE FUNCTION guard_document_child('document_id');

CREATE TRIGGER document_child_revision AFTER INSERT OR DELETE OR UPDATE ON voice_notes FOR EACH ROW EXECUTE FUNCTION bump_document_collection_revision('document_id');

CREATE TRIGGER recording_metadata_deleted AFTER DELETE ON voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_deleted();

CREATE TRIGGER recording_metadata_guard BEFORE INSERT OR UPDATE ON voice_notes FOR EACH ROW EXECUTE FUNCTION recording_private.metadata_guard();

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_request_reservations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_checkout_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_reconciliation_leases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blank_pages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_collection_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_collection_revisions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_favorites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_lifetimes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_owner_epochs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.key_terms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_certificates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_cv_skills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_education ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_experiences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_ideas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_languages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_learning_tracks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_nodes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.office_projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.page_image_annotations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.room_blank_pages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.room_document_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.room_drawings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.room_invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.room_strokes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.room_voice_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.session_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.text_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE reconcile_archive.document_children_20261120 ENABLE ROW LEVEL SECURITY;

ALTER TABLE recording_private.operations ENABLE ROW LEVEL SECURITY;

ALTER TABLE worker_private.recording_worker_token ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_own_sessions ON public.active_sessions AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY ai_usage_select_own ON public.ai_usage AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own blank pages" ON public.blank_pages AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own bookmarks" ON public.bookmarks AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own posts" ON public.community_posts AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert own posts" ON public.community_posts AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY community_posts_select_visible ON public.community_posts AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_community_author(user_id));

CREATE POLICY direct_messages_insert ON public.direct_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = sender_id) AND (sender_id <> recipient_id) AND (EXISTS ( SELECT 1
   FROM friendships f
  WHERE ((f.status = 'accepted'::text) AND (((f.requester_id = auth.uid()) AND (f.receiver_id = direct_messages.recipient_id)) OR ((f.receiver_id = auth.uid()) AND (f.requester_id = direct_messages.recipient_id))))))));

CREATE POLICY direct_messages_select ON public.direct_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));

CREATE POLICY direct_messages_update ON public.direct_messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = recipient_id))
  WITH CHECK ((auth.uid() = recipient_id));

CREATE POLICY collection_revision_owner_read ON public.document_collection_revisions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "Users manage own favorites" ON public.document_favorites AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY document_lifetimes_owner_read ON public.document_lifetimes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "Users manage own doc tags" ON public.document_tags AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users manage own documents" ON public.documents AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own drawings" ON public.drawings AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own flashcard decks" ON public.flashcard_decks AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users manage own flashcards" ON public.flashcards AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can follow" ON public.follows AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = follower_id));

CREATE POLICY "Users can unfollow" ON public.follows AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = follower_id));

CREATE POLICY follows_select_authenticated ON public.follows AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY friendships_delete ON public.friendships AS PERMISSIVE FOR DELETE TO public
  USING (((auth.uid() = requester_id) OR (auth.uid() = receiver_id)));

CREATE POLICY friendships_insert ON public.friendships AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = requester_id) AND (requester_id <> receiver_id) AND (status = 'pending'::text)));

CREATE POLICY friendships_select ON public.friendships AS PERMISSIVE FOR SELECT TO public
  USING (((auth.uid() = requester_id) OR (auth.uid() = receiver_id)));

CREATE POLICY friendships_update ON public.friendships AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((auth.uid() = receiver_id) AND (status = 'pending'::text)))
  WITH CHECK (((auth.uid() = receiver_id) AND (status = ANY (ARRAY['accepted'::text, 'rejected'::text]))));

CREATE POLICY "Users manage own key terms" ON public.key_terms AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY notifications_delete ON public.notifications AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

CREATE POLICY notifications_insert ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((type = 'room_invite'::text) AND ((data ->> 'inviter_id'::text) = (auth.uid())::text) AND (user_id <> auth.uid()) AND (EXISTS ( SELECT 1
   FROM friendships f
  WHERE ((f.status = 'accepted'::text) AND (((f.requester_id = auth.uid()) AND (f.receiver_id = notifications.user_id)) OR ((f.receiver_id = auth.uid()) AND (f.requester_id = notifications.user_id)))))) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.user_id = auth.uid()) AND ((rm.room_id)::text = (notifications.data ->> 'room_id'::text))))) AND (EXISTS ( SELECT 1
   FROM study_rooms sr
  WHERE (((sr.id)::text = (notifications.data ->> 'room_id'::text)) AND ((sr.expires_at IS NULL) OR (sr.expires_at > now())))))));

CREATE POLICY notifications_select ON public.notifications AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

CREATE POLICY notifications_update ON public.notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

CREATE POLICY office_certificates_owner_all ON public.office_certificates AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_cv_skills_owner_all ON public.office_cv_skills AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_education_owner_all ON public.office_education AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_experiences_owner_all ON public.office_experiences AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_files_owner_all ON public.office_files AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_ideas_owner_all ON public.office_ideas AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_languages_owner_all ON public.office_languages AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_learning_tracks_owner_all ON public.office_learning_tracks AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_nodes_owner_all ON public.office_nodes AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_notes_owner_all ON public.office_notes AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_profiles_owner_all ON public.office_profiles AS PERMISSIVE FOR ALL TO authenticated
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY office_projects_owner_all ON public.office_projects AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "users can manage own page_image_annotations" ON public.page_image_annotations AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own comments" ON public.post_comments AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert comments" ON public.post_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM community_posts p
  WHERE (p.id = post_comments.post_id)))));

CREATE POLICY post_comments_select_visible ON public.post_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM community_posts p
  WHERE (p.id = post_comments.post_id))));

CREATE POLICY "Users can like" ON public.post_likes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM community_posts p
  WHERE (p.id = post_likes.post_id)))));

CREATE POLICY "Users can unlike" ON public.post_likes AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

CREATE POLICY post_likes_select_visible ON public.post_likes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM community_posts p
  WHERE (p.id = post_likes.post_id))));

CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

CREATE POLICY profiles_select_authenticated ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Room members can insert room blank pages" ON public.room_blank_pages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_blank_pages.room_id) AND (rm.user_id = auth.uid()))))));

CREATE POLICY "Room members can view room blank pages" ON public.room_blank_pages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM room_members
  WHERE ((room_members.room_id = room_blank_pages.room_id) AND (room_members.user_id = auth.uid())))));

CREATE POLICY room_document_events_insert ON public.room_document_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_document_events.room_id) AND (rm.user_id = auth.uid()))))));

CREATE POLICY room_document_events_select ON public.room_document_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_document_events.room_id) AND (rm.user_id = auth.uid())))));

CREATE POLICY room_drawings_member_delete ON public.room_drawings AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_drawings.room_id) AND (rm.user_id = auth.uid())))));

CREATE POLICY room_drawings_member_insert ON public.room_drawings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_drawings.room_id) AND (rm.user_id = auth.uid())))));

CREATE POLICY room_drawings_member_select ON public.room_drawings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_drawings.room_id) AND (rm.user_id = auth.uid())))));

CREATE POLICY room_drawings_member_update ON public.room_drawings AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_drawings.room_id) AND (rm.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_drawings.room_id) AND (rm.user_id = auth.uid())))));

CREATE POLICY room_invitations_select ON public.room_invitations AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth.uid() = inviter_id) OR (auth.uid() = invitee_id)));

CREATE POLICY "Members can leave room" ON public.room_members AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

CREATE POLICY members_delete ON public.room_members AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() = user_id));

CREATE POLICY members_insert ON public.room_members AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY room_members_visible_to_participants ON public.room_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_room_members(room_id));

CREATE POLICY room_strokes_insert ON public.room_strokes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_strokes.room_id) AND (rm.user_id = auth.uid()))))));

CREATE POLICY room_strokes_select ON public.room_strokes AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_strokes.room_id) AND (rm.user_id = auth.uid())))));

CREATE POLICY "Room members can delete their own voice notes" ON public.room_voice_notes AS PERMISSIVE FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_voice_notes.room_id) AND (rm.user_id = auth.uid()))))));

CREATE POLICY "Room members can insert their own voice notes" ON public.room_voice_notes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_voice_notes.room_id) AND (rm.user_id = auth.uid()))))));

CREATE POLICY "Room members can update their own voice notes" ON public.room_voice_notes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_voice_notes.room_id) AND (rm.user_id = auth.uid()))))))
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = room_voice_notes.room_id) AND (rm.user_id = auth.uid()))))));

CREATE POLICY "Room members can view room voice notes" ON public.room_voice_notes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM room_members
  WHERE ((room_members.room_id = room_voice_notes.room_id) AND (room_members.user_id = auth.uid())))));

CREATE POLICY recording_anon_room_bound ON public.room_voice_notes AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY recording_room_delete ON public.room_voice_notes AS PERMISSIVE FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) AND recording_room_member(room_id)));

CREATE POLICY recording_room_delete_bound ON public.room_voice_notes AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) AND recording_room_member(room_id)));

CREATE POLICY recording_room_read ON public.room_voice_notes AS PERMISSIVE FOR SELECT TO authenticated
  USING (recording_room_member(room_id));

CREATE POLICY recording_room_read_bound ON public.room_voice_notes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (recording_room_member(room_id));

CREATE POLICY recording_room_update ON public.room_voice_notes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND recording_room_member(room_id)))
  WITH CHECK (((user_id = auth.uid()) AND recording_room_member(room_id)));

CREATE POLICY recording_room_update_bound ON public.room_voice_notes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND recording_room_member(room_id)))
  WITH CHECK (((user_id = auth.uid()) AND recording_room_member(room_id)));

CREATE POLICY "Users manage own session" ON public.session_state AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY study_rooms_authorized_select ON public.study_rooms AS PERMISSIVE FOR SELECT TO authenticated
  USING (((host_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.room_id = study_rooms.id) AND (rm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM room_invitations ri
  WHERE ((ri.room_id = study_rooms.id) AND (ri.invitee_id = auth.uid()) AND (ri.status = ANY (ARRAY['pending'::text, 'accepted'::text])) AND (ri.expires_at > now()))))));

CREATE POLICY study_rooms_host_delete ON public.study_rooms AS PERMISSIVE FOR DELETE TO authenticated
  USING ((host_user_id = auth.uid()));

CREATE POLICY study_rooms_host_insert ON public.study_rooms AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((host_user_id = auth.uid()));

CREATE POLICY study_rooms_host_update ON public.study_rooms AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((host_user_id = auth.uid()))
  WITH CHECK ((host_user_id = auth.uid()));

CREATE POLICY "Users manage own sessions" ON public.study_sessions AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users manage own text notes" ON public.text_notes AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY users_manage_own_preferences ON public.user_preferences AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users manage own user_settings" ON public.user_settings AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users manage own voice notes" ON public.voice_notes AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));

CREATE POLICY recording_anon_document_bound ON public.voice_notes AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY recording_document_delete ON public.voice_notes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY recording_document_delete_bound ON public.voice_notes AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY recording_document_read ON public.voice_notes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY recording_document_read_bound ON public.voice_notes AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY recording_document_update ON public.voice_notes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY recording_document_update_bound ON public.voice_notes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "Study room members can receive realtime" ON realtime.messages;
CREATE POLICY "Study room members can receive realtime" ON realtime.messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((extension = ANY (ARRAY['broadcast'::text, 'presence'::text])) AND (split_part(realtime.topic(), ':'::text, 1) = 'room'::text) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE (((rm.room_id)::text = split_part(realtime.topic(), ':'::text, 2)) AND (rm.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Study room members can send realtime" ON realtime.messages;
CREATE POLICY "Study room members can send realtime" ON realtime.messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((extension = ANY (ARRAY['broadcast'::text, 'presence'::text])) AND (split_part(realtime.topic(), ':'::text, 1) = 'room'::text) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE (((rm.room_id)::text = split_part(realtime.topic(), ':'::text, 2)) AND (rm.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "Authenticated users can read room voice notes" ON storage.objects;
CREATE POLICY "Authenticated users can read room voice notes" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'voice-notes'::text) AND ((storage.foldername(name))[1] = 'rooms'::text) AND (EXISTS ( SELECT 1
   FROM room_members rm
  WHERE ((rm.user_id = auth.uid()) AND ((rm.room_id)::text = (storage.foldername(objects.name))[2]))))));

DROP POLICY IF EXISTS "Authenticated users can upload room voice notes" ON storage.objects;
CREATE POLICY "Authenticated users can upload room voice notes" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'voice-notes'::text) AND ((storage.foldername(name))[1] = 'rooms'::text) AND (EXISTS ( SELECT 1
   FROM (room_members rm
     JOIN study_rooms r ON ((r.id = rm.room_id)))
  WHERE ((rm.user_id = auth.uid()) AND ((rm.room_id)::text = (storage.foldername(objects.name))[2]) AND (r.status = 'active'::text) AND ((r.expires_at IS NULL) OR (r.expires_at > now())))))));

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can delete own pdfs" ON storage.objects;
CREATE POLICY "Users can delete own pdfs" ON storage.objects AS PERMISSIVE FOR DELETE TO public
  USING (((bucket_id = 'pdfs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can delete own voice notes" ON storage.objects;
CREATE POLICY "Users can delete own voice notes" ON storage.objects AS PERMISSIVE FOR DELETE TO public
  USING (((bucket_id = 'voice-notes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can read own pdfs" ON storage.objects;
CREATE POLICY "Users can read own pdfs" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING (((bucket_id = 'pdfs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can read own voice notes" ON storage.objects;
CREATE POLICY "Users can read own voice notes" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING (((bucket_id = 'voice-notes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can update own voice notes" ON storage.objects;
CREATE POLICY "Users can update own voice notes" ON storage.objects AS PERMISSIVE FOR UPDATE TO public
  USING (((bucket_id = 'voice-notes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])))
  WITH CHECK (((bucket_id = 'voice-notes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "Users can upload pdfs" ON storage.objects;
CREATE POLICY "Users can upload pdfs" ON storage.objects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((bucket_id = 'pdfs'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can upload voice notes" ON storage.objects;
CREATE POLICY "Users can upload voice notes" ON storage.objects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((bucket_id = 'voice-notes'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS office_files_owner_delete ON storage.objects;
CREATE POLICY office_files_owner_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'office-files'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

DROP POLICY IF EXISTS office_files_owner_insert ON storage.objects;
CREATE POLICY office_files_owner_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'office-files'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

DROP POLICY IF EXISTS office_files_owner_read ON storage.objects;
CREATE POLICY office_files_owner_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'office-files'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

DROP POLICY IF EXISTS office_files_owner_update ON storage.objects;
CREATE POLICY office_files_owner_update ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'office-files'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((bucket_id = 'office-files'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

DROP POLICY IF EXISTS pdf_authorized_read ON storage.objects;
CREATE POLICY pdf_authorized_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'pdfs'::text) AND can_read_pdf_object(name)));

DROP POLICY IF EXISTS pdf_delete_owner_bound ON storage.objects;
CREATE POLICY pdf_delete_owner_bound ON storage.objects AS RESTRICTIVE FOR DELETE TO public
  USING (((bucket_id <> 'pdfs'::text) OR ((auth.uid() IS NOT NULL) AND (split_part(name, '/'::text, 1) = (auth.uid())::text) AND (strpos(name, '/'::text) > 0))));

DROP POLICY IF EXISTS pdf_insert_owner_bound ON storage.objects;
CREATE POLICY pdf_insert_owner_bound ON storage.objects AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (((bucket_id <> 'pdfs'::text) OR ((auth.uid() IS NOT NULL) AND (split_part(name, '/'::text, 1) = (auth.uid())::text) AND (strpos(name, '/'::text) > 0))));

DROP POLICY IF EXISTS pdf_read_scope_bound ON storage.objects;
CREATE POLICY pdf_read_scope_bound ON storage.objects AS RESTRICTIVE FOR SELECT TO public
  USING (((bucket_id <> 'pdfs'::text) OR can_read_pdf_object(name)));

DROP POLICY IF EXISTS pdf_update_owner_bound ON storage.objects;
CREATE POLICY pdf_update_owner_bound ON storage.objects AS RESTRICTIVE FOR UPDATE TO public
  USING (((bucket_id <> 'pdfs'::text) OR ((auth.uid() IS NOT NULL) AND (split_part(name, '/'::text, 1) = (auth.uid())::text) AND (strpos(name, '/'::text) > 0))))
  WITH CHECK (((bucket_id <> 'pdfs'::text) OR ((auth.uid() IS NOT NULL) AND (split_part(name, '/'::text, 1) = (auth.uid())::text) AND (strpos(name, '/'::text) > 0))));

DROP POLICY IF EXISTS pdfs_rooms_delete ON storage.objects;
CREATE POLICY pdfs_rooms_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'pdfs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS pdfs_rooms_insert ON storage.objects;
CREATE POLICY pdfs_rooms_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'pdfs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS recording_anon_storage_delete_bound ON storage.objects;
CREATE POLICY recording_anon_storage_delete_bound ON storage.objects AS RESTRICTIVE FOR DELETE TO anon
  USING ((bucket_id <> 'voice-notes'::text));

DROP POLICY IF EXISTS recording_anon_storage_insert_bound ON storage.objects;
CREATE POLICY recording_anon_storage_insert_bound ON storage.objects AS RESTRICTIVE FOR INSERT TO anon
  WITH CHECK ((bucket_id <> 'voice-notes'::text));

DROP POLICY IF EXISTS recording_anon_storage_read_bound ON storage.objects;
CREATE POLICY recording_anon_storage_read_bound ON storage.objects AS RESTRICTIVE FOR SELECT TO anon
  USING ((bucket_id <> 'voice-notes'::text));

DROP POLICY IF EXISTS recording_anon_storage_update_bound ON storage.objects;
CREATE POLICY recording_anon_storage_update_bound ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon
  USING ((bucket_id <> 'voice-notes'::text))
  WITH CHECK ((bucket_id <> 'voice-notes'::text));

DROP POLICY IF EXISTS recording_cleanup_server_only ON storage.objects;
CREATE POLICY recording_cleanup_server_only ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((bucket_id <> 'voice-notes'::text));

DROP POLICY IF EXISTS recording_objects_immutable ON storage.objects;
CREATE POLICY recording_objects_immutable ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((bucket_id <> 'voice-notes'::text))
  WITH CHECK ((bucket_id <> 'voice-notes'::text));

DROP POLICY IF EXISTS recording_playback_server_only ON storage.objects;
CREATE POLICY recording_playback_server_only ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((bucket_id <> 'voice-notes'::text) OR recording_legacy_playback_allowed(name)));

DROP POLICY IF EXISTS recording_upload_insert ON storage.objects;
CREATE POLICY recording_upload_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'voice-notes'::text) AND storage.allow_only_operation('object.upload'::text) AND recording_upload_allowed(name)));

DROP POLICY IF EXISTS recording_upload_must_be_tracked ON storage.objects;
CREATE POLICY recording_upload_must_be_tracked ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id <> 'voice-notes'::text) OR (storage.allow_only_operation('object.upload'::text) AND recording_upload_allowed(name))));

REVOKE ALL ON SCHEMA reconcile_archive FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON SCHEMA recording_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA recording_private TO service_role;

REVOKE ALL ON SCHEMA worker_private FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.active_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.active_sessions TO anon;
GRANT INSERT ON TABLE public.active_sessions TO anon;
GRANT MAINTAIN ON TABLE public.active_sessions TO anon;
GRANT REFERENCES ON TABLE public.active_sessions TO anon;
GRANT SELECT ON TABLE public.active_sessions TO anon;
GRANT TRIGGER ON TABLE public.active_sessions TO anon;
GRANT TRUNCATE ON TABLE public.active_sessions TO anon;
GRANT UPDATE ON TABLE public.active_sessions TO anon;
GRANT DELETE ON TABLE public.active_sessions TO authenticated;
GRANT INSERT ON TABLE public.active_sessions TO authenticated;
GRANT MAINTAIN ON TABLE public.active_sessions TO authenticated;
GRANT REFERENCES ON TABLE public.active_sessions TO authenticated;
GRANT SELECT ON TABLE public.active_sessions TO authenticated;
GRANT TRIGGER ON TABLE public.active_sessions TO authenticated;
GRANT TRUNCATE ON TABLE public.active_sessions TO authenticated;
GRANT UPDATE ON TABLE public.active_sessions TO authenticated;
GRANT DELETE ON TABLE public.active_sessions TO service_role;
GRANT INSERT ON TABLE public.active_sessions TO service_role;
GRANT MAINTAIN ON TABLE public.active_sessions TO service_role;
GRANT REFERENCES ON TABLE public.active_sessions TO service_role;
GRANT SELECT ON TABLE public.active_sessions TO service_role;
GRANT TRIGGER ON TABLE public.active_sessions TO service_role;
GRANT TRUNCATE ON TABLE public.active_sessions TO service_role;
GRANT UPDATE ON TABLE public.active_sessions TO service_role;

REVOKE ALL ON TABLE public.ai_request_reservations FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.ai_request_reservations TO service_role;
GRANT INSERT ON TABLE public.ai_request_reservations TO service_role;
GRANT MAINTAIN ON TABLE public.ai_request_reservations TO service_role;
GRANT REFERENCES ON TABLE public.ai_request_reservations TO service_role;
GRANT SELECT ON TABLE public.ai_request_reservations TO service_role;
GRANT TRIGGER ON TABLE public.ai_request_reservations TO service_role;
GRANT TRUNCATE ON TABLE public.ai_request_reservations TO service_role;
GRANT UPDATE ON TABLE public.ai_request_reservations TO service_role;

REVOKE ALL ON TABLE public.ai_usage FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.ai_usage TO anon;
GRANT INSERT ON TABLE public.ai_usage TO anon;
GRANT MAINTAIN ON TABLE public.ai_usage TO anon;
GRANT REFERENCES ON TABLE public.ai_usage TO anon;
GRANT SELECT ON TABLE public.ai_usage TO anon;
GRANT TRIGGER ON TABLE public.ai_usage TO anon;
GRANT TRUNCATE ON TABLE public.ai_usage TO anon;
GRANT UPDATE ON TABLE public.ai_usage TO anon;
GRANT DELETE ON TABLE public.ai_usage TO authenticated;
GRANT INSERT ON TABLE public.ai_usage TO authenticated;
GRANT MAINTAIN ON TABLE public.ai_usage TO authenticated;
GRANT REFERENCES ON TABLE public.ai_usage TO authenticated;
GRANT SELECT ON TABLE public.ai_usage TO authenticated;
GRANT TRIGGER ON TABLE public.ai_usage TO authenticated;
GRANT TRUNCATE ON TABLE public.ai_usage TO authenticated;
GRANT UPDATE ON TABLE public.ai_usage TO authenticated;
GRANT DELETE ON TABLE public.ai_usage TO service_role;
GRANT INSERT ON TABLE public.ai_usage TO service_role;
GRANT MAINTAIN ON TABLE public.ai_usage TO service_role;
GRANT REFERENCES ON TABLE public.ai_usage TO service_role;
GRANT SELECT ON TABLE public.ai_usage TO service_role;
GRANT TRIGGER ON TABLE public.ai_usage TO service_role;
GRANT TRUNCATE ON TABLE public.ai_usage TO service_role;
GRANT UPDATE ON TABLE public.ai_usage TO service_role;

REVOKE ALL ON TABLE public.billing_checkout_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.billing_checkout_attempts TO service_role;
GRANT INSERT ON TABLE public.billing_checkout_attempts TO service_role;
GRANT MAINTAIN ON TABLE public.billing_checkout_attempts TO service_role;
GRANT REFERENCES ON TABLE public.billing_checkout_attempts TO service_role;
GRANT SELECT ON TABLE public.billing_checkout_attempts TO service_role;
GRANT TRIGGER ON TABLE public.billing_checkout_attempts TO service_role;
GRANT TRUNCATE ON TABLE public.billing_checkout_attempts TO service_role;
GRANT UPDATE ON TABLE public.billing_checkout_attempts TO service_role;

REVOKE ALL ON TABLE public.billing_events FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.billing_events TO service_role;
GRANT INSERT ON TABLE public.billing_events TO service_role;
GRANT MAINTAIN ON TABLE public.billing_events TO service_role;
GRANT REFERENCES ON TABLE public.billing_events TO service_role;
GRANT SELECT ON TABLE public.billing_events TO service_role;
GRANT TRIGGER ON TABLE public.billing_events TO service_role;
GRANT TRUNCATE ON TABLE public.billing_events TO service_role;
GRANT UPDATE ON TABLE public.billing_events TO service_role;

REVOKE ALL ON TABLE public.billing_reconciliation_leases FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.billing_reconciliation_leases TO service_role;
GRANT INSERT ON TABLE public.billing_reconciliation_leases TO service_role;
GRANT MAINTAIN ON TABLE public.billing_reconciliation_leases TO service_role;
GRANT REFERENCES ON TABLE public.billing_reconciliation_leases TO service_role;
GRANT SELECT ON TABLE public.billing_reconciliation_leases TO service_role;
GRANT TRIGGER ON TABLE public.billing_reconciliation_leases TO service_role;
GRANT TRUNCATE ON TABLE public.billing_reconciliation_leases TO service_role;
GRANT UPDATE ON TABLE public.billing_reconciliation_leases TO service_role;

REVOKE ALL ON TABLE public.blank_pages FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.blank_pages TO anon;
GRANT REFERENCES ON TABLE public.blank_pages TO anon;
GRANT SELECT ON TABLE public.blank_pages TO anon;
GRANT TRIGGER ON TABLE public.blank_pages TO anon;
GRANT MAINTAIN ON TABLE public.blank_pages TO authenticated;
GRANT REFERENCES ON TABLE public.blank_pages TO authenticated;
GRANT SELECT ON TABLE public.blank_pages TO authenticated;
GRANT TRIGGER ON TABLE public.blank_pages TO authenticated;
GRANT DELETE ON TABLE public.blank_pages TO service_role;
GRANT INSERT ON TABLE public.blank_pages TO service_role;
GRANT MAINTAIN ON TABLE public.blank_pages TO service_role;
GRANT REFERENCES ON TABLE public.blank_pages TO service_role;
GRANT SELECT ON TABLE public.blank_pages TO service_role;
GRANT TRIGGER ON TABLE public.blank_pages TO service_role;
GRANT UPDATE ON TABLE public.blank_pages TO service_role;

REVOKE ALL ON TABLE public.bookmarks FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.bookmarks TO anon;
GRANT REFERENCES ON TABLE public.bookmarks TO anon;
GRANT SELECT ON TABLE public.bookmarks TO anon;
GRANT TRIGGER ON TABLE public.bookmarks TO anon;
GRANT MAINTAIN ON TABLE public.bookmarks TO authenticated;
GRANT REFERENCES ON TABLE public.bookmarks TO authenticated;
GRANT SELECT ON TABLE public.bookmarks TO authenticated;
GRANT TRIGGER ON TABLE public.bookmarks TO authenticated;
GRANT DELETE ON TABLE public.bookmarks TO service_role;
GRANT INSERT ON TABLE public.bookmarks TO service_role;
GRANT MAINTAIN ON TABLE public.bookmarks TO service_role;
GRANT REFERENCES ON TABLE public.bookmarks TO service_role;
GRANT SELECT ON TABLE public.bookmarks TO service_role;
GRANT TRIGGER ON TABLE public.bookmarks TO service_role;
GRANT UPDATE ON TABLE public.bookmarks TO service_role;

REVOKE ALL ON TABLE public.community_posts FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.community_posts TO anon;
GRANT INSERT ON TABLE public.community_posts TO anon;
GRANT MAINTAIN ON TABLE public.community_posts TO anon;
GRANT REFERENCES ON TABLE public.community_posts TO anon;
GRANT SELECT ON TABLE public.community_posts TO anon;
GRANT TRIGGER ON TABLE public.community_posts TO anon;
GRANT UPDATE ON TABLE public.community_posts TO anon;
GRANT DELETE ON TABLE public.community_posts TO authenticated;
GRANT INSERT ON TABLE public.community_posts TO authenticated;
GRANT MAINTAIN ON TABLE public.community_posts TO authenticated;
GRANT REFERENCES ON TABLE public.community_posts TO authenticated;
GRANT SELECT ON TABLE public.community_posts TO authenticated;
GRANT TRIGGER ON TABLE public.community_posts TO authenticated;
GRANT UPDATE ON TABLE public.community_posts TO authenticated;
GRANT DELETE ON TABLE public.community_posts TO service_role;
GRANT INSERT ON TABLE public.community_posts TO service_role;
GRANT MAINTAIN ON TABLE public.community_posts TO service_role;
GRANT REFERENCES ON TABLE public.community_posts TO service_role;
GRANT SELECT ON TABLE public.community_posts TO service_role;
GRANT TRIGGER ON TABLE public.community_posts TO service_role;
GRANT UPDATE ON TABLE public.community_posts TO service_role;

REVOKE ALL ON TABLE public.direct_messages FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.direct_messages TO anon;
GRANT INSERT ON TABLE public.direct_messages TO anon;
GRANT MAINTAIN ON TABLE public.direct_messages TO anon;
GRANT REFERENCES ON TABLE public.direct_messages TO anon;
GRANT SELECT ON TABLE public.direct_messages TO anon;
GRANT TRIGGER ON TABLE public.direct_messages TO anon;
GRANT TRUNCATE ON TABLE public.direct_messages TO anon;
GRANT UPDATE ON TABLE public.direct_messages TO anon;
GRANT DELETE ON TABLE public.direct_messages TO authenticated;
GRANT INSERT ON TABLE public.direct_messages TO authenticated;
GRANT MAINTAIN ON TABLE public.direct_messages TO authenticated;
GRANT REFERENCES ON TABLE public.direct_messages TO authenticated;
GRANT SELECT ON TABLE public.direct_messages TO authenticated;
GRANT TRIGGER ON TABLE public.direct_messages TO authenticated;
GRANT TRUNCATE ON TABLE public.direct_messages TO authenticated;
GRANT UPDATE ON TABLE public.direct_messages TO authenticated;
GRANT DELETE ON TABLE public.direct_messages TO service_role;
GRANT INSERT ON TABLE public.direct_messages TO service_role;
GRANT MAINTAIN ON TABLE public.direct_messages TO service_role;
GRANT REFERENCES ON TABLE public.direct_messages TO service_role;
GRANT SELECT ON TABLE public.direct_messages TO service_role;
GRANT TRIGGER ON TABLE public.direct_messages TO service_role;
GRANT TRUNCATE ON TABLE public.direct_messages TO service_role;
GRANT UPDATE ON TABLE public.direct_messages TO service_role;

REVOKE ALL ON TABLE public.document_collection_receipts FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.document_collection_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.document_collection_revisions TO authenticated;
GRANT SELECT ON TABLE public.document_collection_revisions TO service_role;

REVOKE ALL ON TABLE public.document_favorites FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.document_favorites TO anon;
GRANT INSERT ON TABLE public.document_favorites TO anon;
GRANT MAINTAIN ON TABLE public.document_favorites TO anon;
GRANT REFERENCES ON TABLE public.document_favorites TO anon;
GRANT SELECT ON TABLE public.document_favorites TO anon;
GRANT TRIGGER ON TABLE public.document_favorites TO anon;
GRANT UPDATE ON TABLE public.document_favorites TO anon;
GRANT DELETE ON TABLE public.document_favorites TO authenticated;
GRANT INSERT ON TABLE public.document_favorites TO authenticated;
GRANT MAINTAIN ON TABLE public.document_favorites TO authenticated;
GRANT REFERENCES ON TABLE public.document_favorites TO authenticated;
GRANT SELECT ON TABLE public.document_favorites TO authenticated;
GRANT TRIGGER ON TABLE public.document_favorites TO authenticated;
GRANT UPDATE ON TABLE public.document_favorites TO authenticated;
GRANT DELETE ON TABLE public.document_favorites TO service_role;
GRANT INSERT ON TABLE public.document_favorites TO service_role;
GRANT MAINTAIN ON TABLE public.document_favorites TO service_role;
GRANT REFERENCES ON TABLE public.document_favorites TO service_role;
GRANT SELECT ON TABLE public.document_favorites TO service_role;
GRANT TRIGGER ON TABLE public.document_favorites TO service_role;
GRANT UPDATE ON TABLE public.document_favorites TO service_role;

REVOKE ALL ON TABLE public.document_lifetimes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.document_lifetimes TO authenticated;
GRANT SELECT ON TABLE public.document_lifetimes TO service_role;

REVOKE ALL ON TABLE public.document_owner_epochs FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.document_tags FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.document_tags TO anon;
GRANT INSERT ON TABLE public.document_tags TO anon;
GRANT MAINTAIN ON TABLE public.document_tags TO anon;
GRANT REFERENCES ON TABLE public.document_tags TO anon;
GRANT SELECT ON TABLE public.document_tags TO anon;
GRANT TRIGGER ON TABLE public.document_tags TO anon;
GRANT UPDATE ON TABLE public.document_tags TO anon;
GRANT DELETE ON TABLE public.document_tags TO authenticated;
GRANT INSERT ON TABLE public.document_tags TO authenticated;
GRANT MAINTAIN ON TABLE public.document_tags TO authenticated;
GRANT REFERENCES ON TABLE public.document_tags TO authenticated;
GRANT SELECT ON TABLE public.document_tags TO authenticated;
GRANT TRIGGER ON TABLE public.document_tags TO authenticated;
GRANT UPDATE ON TABLE public.document_tags TO authenticated;
GRANT DELETE ON TABLE public.document_tags TO service_role;
GRANT INSERT ON TABLE public.document_tags TO service_role;
GRANT MAINTAIN ON TABLE public.document_tags TO service_role;
GRANT REFERENCES ON TABLE public.document_tags TO service_role;
GRANT SELECT ON TABLE public.document_tags TO service_role;
GRANT TRIGGER ON TABLE public.document_tags TO service_role;
GRANT UPDATE ON TABLE public.document_tags TO service_role;

REVOKE ALL ON TABLE public.document_tombstones FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.document_tombstones TO authenticated;
GRANT SELECT ON TABLE public.document_tombstones TO service_role;

REVOKE ALL ON TABLE public.documents FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.documents TO anon;
GRANT INSERT ON TABLE public.documents TO anon;
GRANT MAINTAIN ON TABLE public.documents TO anon;
GRANT REFERENCES ON TABLE public.documents TO anon;
GRANT SELECT ON TABLE public.documents TO anon;
GRANT TRIGGER ON TABLE public.documents TO anon;
GRANT UPDATE ON TABLE public.documents TO anon;
GRANT DELETE ON TABLE public.documents TO authenticated;
GRANT INSERT ON TABLE public.documents TO authenticated;
GRANT MAINTAIN ON TABLE public.documents TO authenticated;
GRANT REFERENCES ON TABLE public.documents TO authenticated;
GRANT SELECT ON TABLE public.documents TO authenticated;
GRANT TRIGGER ON TABLE public.documents TO authenticated;
GRANT UPDATE ON TABLE public.documents TO authenticated;
GRANT DELETE ON TABLE public.documents TO service_role;
GRANT INSERT ON TABLE public.documents TO service_role;
GRANT MAINTAIN ON TABLE public.documents TO service_role;
GRANT REFERENCES ON TABLE public.documents TO service_role;
GRANT SELECT ON TABLE public.documents TO service_role;
GRANT TRIGGER ON TABLE public.documents TO service_role;
GRANT UPDATE ON TABLE public.documents TO service_role;

REVOKE ALL ON TABLE public.drawings FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.drawings TO anon;
GRANT REFERENCES ON TABLE public.drawings TO anon;
GRANT SELECT ON TABLE public.drawings TO anon;
GRANT TRIGGER ON TABLE public.drawings TO anon;
GRANT MAINTAIN ON TABLE public.drawings TO authenticated;
GRANT REFERENCES ON TABLE public.drawings TO authenticated;
GRANT SELECT ON TABLE public.drawings TO authenticated;
GRANT TRIGGER ON TABLE public.drawings TO authenticated;
GRANT DELETE ON TABLE public.drawings TO service_role;
GRANT INSERT ON TABLE public.drawings TO service_role;
GRANT MAINTAIN ON TABLE public.drawings TO service_role;
GRANT REFERENCES ON TABLE public.drawings TO service_role;
GRANT SELECT ON TABLE public.drawings TO service_role;
GRANT TRIGGER ON TABLE public.drawings TO service_role;
GRANT UPDATE ON TABLE public.drawings TO service_role;

REVOKE ALL ON TABLE public.flashcard_decks FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.flashcard_decks TO anon;
GRANT INSERT ON TABLE public.flashcard_decks TO anon;
GRANT MAINTAIN ON TABLE public.flashcard_decks TO anon;
GRANT REFERENCES ON TABLE public.flashcard_decks TO anon;
GRANT SELECT ON TABLE public.flashcard_decks TO anon;
GRANT TRIGGER ON TABLE public.flashcard_decks TO anon;
GRANT UPDATE ON TABLE public.flashcard_decks TO anon;
GRANT DELETE ON TABLE public.flashcard_decks TO authenticated;
GRANT INSERT ON TABLE public.flashcard_decks TO authenticated;
GRANT MAINTAIN ON TABLE public.flashcard_decks TO authenticated;
GRANT REFERENCES ON TABLE public.flashcard_decks TO authenticated;
GRANT SELECT ON TABLE public.flashcard_decks TO authenticated;
GRANT TRIGGER ON TABLE public.flashcard_decks TO authenticated;
GRANT UPDATE ON TABLE public.flashcard_decks TO authenticated;
GRANT DELETE ON TABLE public.flashcard_decks TO service_role;
GRANT INSERT ON TABLE public.flashcard_decks TO service_role;
GRANT MAINTAIN ON TABLE public.flashcard_decks TO service_role;
GRANT REFERENCES ON TABLE public.flashcard_decks TO service_role;
GRANT SELECT ON TABLE public.flashcard_decks TO service_role;
GRANT TRIGGER ON TABLE public.flashcard_decks TO service_role;
GRANT UPDATE ON TABLE public.flashcard_decks TO service_role;

REVOKE ALL ON TABLE public.flashcards FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.flashcards TO anon;
GRANT REFERENCES ON TABLE public.flashcards TO anon;
GRANT SELECT ON TABLE public.flashcards TO anon;
GRANT TRIGGER ON TABLE public.flashcards TO anon;
GRANT MAINTAIN ON TABLE public.flashcards TO authenticated;
GRANT REFERENCES ON TABLE public.flashcards TO authenticated;
GRANT SELECT ON TABLE public.flashcards TO authenticated;
GRANT TRIGGER ON TABLE public.flashcards TO authenticated;
GRANT DELETE ON TABLE public.flashcards TO service_role;
GRANT INSERT ON TABLE public.flashcards TO service_role;
GRANT MAINTAIN ON TABLE public.flashcards TO service_role;
GRANT REFERENCES ON TABLE public.flashcards TO service_role;
GRANT SELECT ON TABLE public.flashcards TO service_role;
GRANT TRIGGER ON TABLE public.flashcards TO service_role;
GRANT UPDATE ON TABLE public.flashcards TO service_role;

REVOKE ALL ON TABLE public.follows FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.follows TO anon;
GRANT INSERT ON TABLE public.follows TO anon;
GRANT MAINTAIN ON TABLE public.follows TO anon;
GRANT REFERENCES ON TABLE public.follows TO anon;
GRANT SELECT ON TABLE public.follows TO anon;
GRANT TRIGGER ON TABLE public.follows TO anon;
GRANT TRUNCATE ON TABLE public.follows TO anon;
GRANT UPDATE ON TABLE public.follows TO anon;
GRANT DELETE ON TABLE public.follows TO authenticated;
GRANT INSERT ON TABLE public.follows TO authenticated;
GRANT MAINTAIN ON TABLE public.follows TO authenticated;
GRANT REFERENCES ON TABLE public.follows TO authenticated;
GRANT SELECT ON TABLE public.follows TO authenticated;
GRANT TRIGGER ON TABLE public.follows TO authenticated;
GRANT TRUNCATE ON TABLE public.follows TO authenticated;
GRANT UPDATE ON TABLE public.follows TO authenticated;
GRANT DELETE ON TABLE public.follows TO service_role;
GRANT INSERT ON TABLE public.follows TO service_role;
GRANT MAINTAIN ON TABLE public.follows TO service_role;
GRANT REFERENCES ON TABLE public.follows TO service_role;
GRANT SELECT ON TABLE public.follows TO service_role;
GRANT TRIGGER ON TABLE public.follows TO service_role;
GRANT TRUNCATE ON TABLE public.follows TO service_role;
GRANT UPDATE ON TABLE public.follows TO service_role;

REVOKE ALL ON TABLE public.friendships FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.friendships TO anon;
GRANT INSERT ON TABLE public.friendships TO anon;
GRANT MAINTAIN ON TABLE public.friendships TO anon;
GRANT REFERENCES ON TABLE public.friendships TO anon;
GRANT SELECT ON TABLE public.friendships TO anon;
GRANT TRIGGER ON TABLE public.friendships TO anon;
GRANT TRUNCATE ON TABLE public.friendships TO anon;
GRANT DELETE ON TABLE public.friendships TO authenticated;
GRANT INSERT ON TABLE public.friendships TO authenticated;
GRANT MAINTAIN ON TABLE public.friendships TO authenticated;
GRANT REFERENCES ON TABLE public.friendships TO authenticated;
GRANT SELECT ON TABLE public.friendships TO authenticated;
GRANT TRIGGER ON TABLE public.friendships TO authenticated;
GRANT TRUNCATE ON TABLE public.friendships TO authenticated;
GRANT DELETE ON TABLE public.friendships TO service_role;
GRANT INSERT ON TABLE public.friendships TO service_role;
GRANT MAINTAIN ON TABLE public.friendships TO service_role;
GRANT REFERENCES ON TABLE public.friendships TO service_role;
GRANT SELECT ON TABLE public.friendships TO service_role;
GRANT TRIGGER ON TABLE public.friendships TO service_role;
GRANT TRUNCATE ON TABLE public.friendships TO service_role;
GRANT UPDATE ON TABLE public.friendships TO service_role;

REVOKE ALL ON TABLE public.key_terms FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.key_terms TO anon;
GRANT REFERENCES ON TABLE public.key_terms TO anon;
GRANT SELECT ON TABLE public.key_terms TO anon;
GRANT TRIGGER ON TABLE public.key_terms TO anon;
GRANT MAINTAIN ON TABLE public.key_terms TO authenticated;
GRANT REFERENCES ON TABLE public.key_terms TO authenticated;
GRANT SELECT ON TABLE public.key_terms TO authenticated;
GRANT TRIGGER ON TABLE public.key_terms TO authenticated;
GRANT DELETE ON TABLE public.key_terms TO service_role;
GRANT INSERT ON TABLE public.key_terms TO service_role;
GRANT MAINTAIN ON TABLE public.key_terms TO service_role;
GRANT REFERENCES ON TABLE public.key_terms TO service_role;
GRANT SELECT ON TABLE public.key_terms TO service_role;
GRANT TRIGGER ON TABLE public.key_terms TO service_role;
GRANT UPDATE ON TABLE public.key_terms TO service_role;

REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.notifications TO anon;
GRANT INSERT ON TABLE public.notifications TO anon;
GRANT MAINTAIN ON TABLE public.notifications TO anon;
GRANT REFERENCES ON TABLE public.notifications TO anon;
GRANT SELECT ON TABLE public.notifications TO anon;
GRANT TRIGGER ON TABLE public.notifications TO anon;
GRANT TRUNCATE ON TABLE public.notifications TO anon;
GRANT UPDATE ON TABLE public.notifications TO anon;
GRANT DELETE ON TABLE public.notifications TO authenticated;
GRANT INSERT ON TABLE public.notifications TO authenticated;
GRANT MAINTAIN ON TABLE public.notifications TO authenticated;
GRANT REFERENCES ON TABLE public.notifications TO authenticated;
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT TRIGGER ON TABLE public.notifications TO authenticated;
GRANT TRUNCATE ON TABLE public.notifications TO authenticated;
GRANT UPDATE ON TABLE public.notifications TO authenticated;
GRANT DELETE ON TABLE public.notifications TO service_role;
GRANT INSERT ON TABLE public.notifications TO service_role;
GRANT MAINTAIN ON TABLE public.notifications TO service_role;
GRANT REFERENCES ON TABLE public.notifications TO service_role;
GRANT SELECT ON TABLE public.notifications TO service_role;
GRANT TRIGGER ON TABLE public.notifications TO service_role;
GRANT TRUNCATE ON TABLE public.notifications TO service_role;
GRANT UPDATE ON TABLE public.notifications TO service_role;

REVOKE ALL ON TABLE public.office_certificates FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_certificates TO anon;
GRANT INSERT ON TABLE public.office_certificates TO anon;
GRANT MAINTAIN ON TABLE public.office_certificates TO anon;
GRANT REFERENCES ON TABLE public.office_certificates TO anon;
GRANT SELECT ON TABLE public.office_certificates TO anon;
GRANT TRIGGER ON TABLE public.office_certificates TO anon;
GRANT TRUNCATE ON TABLE public.office_certificates TO anon;
GRANT UPDATE ON TABLE public.office_certificates TO anon;
GRANT DELETE ON TABLE public.office_certificates TO authenticated;
GRANT INSERT ON TABLE public.office_certificates TO authenticated;
GRANT MAINTAIN ON TABLE public.office_certificates TO authenticated;
GRANT REFERENCES ON TABLE public.office_certificates TO authenticated;
GRANT SELECT ON TABLE public.office_certificates TO authenticated;
GRANT TRIGGER ON TABLE public.office_certificates TO authenticated;
GRANT TRUNCATE ON TABLE public.office_certificates TO authenticated;
GRANT UPDATE ON TABLE public.office_certificates TO authenticated;
GRANT DELETE ON TABLE public.office_certificates TO service_role;
GRANT INSERT ON TABLE public.office_certificates TO service_role;
GRANT MAINTAIN ON TABLE public.office_certificates TO service_role;
GRANT REFERENCES ON TABLE public.office_certificates TO service_role;
GRANT SELECT ON TABLE public.office_certificates TO service_role;
GRANT TRIGGER ON TABLE public.office_certificates TO service_role;
GRANT TRUNCATE ON TABLE public.office_certificates TO service_role;
GRANT UPDATE ON TABLE public.office_certificates TO service_role;

REVOKE ALL ON TABLE public.office_cv_skills FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_cv_skills TO anon;
GRANT INSERT ON TABLE public.office_cv_skills TO anon;
GRANT MAINTAIN ON TABLE public.office_cv_skills TO anon;
GRANT REFERENCES ON TABLE public.office_cv_skills TO anon;
GRANT SELECT ON TABLE public.office_cv_skills TO anon;
GRANT TRIGGER ON TABLE public.office_cv_skills TO anon;
GRANT TRUNCATE ON TABLE public.office_cv_skills TO anon;
GRANT UPDATE ON TABLE public.office_cv_skills TO anon;
GRANT DELETE ON TABLE public.office_cv_skills TO authenticated;
GRANT INSERT ON TABLE public.office_cv_skills TO authenticated;
GRANT MAINTAIN ON TABLE public.office_cv_skills TO authenticated;
GRANT REFERENCES ON TABLE public.office_cv_skills TO authenticated;
GRANT SELECT ON TABLE public.office_cv_skills TO authenticated;
GRANT TRIGGER ON TABLE public.office_cv_skills TO authenticated;
GRANT TRUNCATE ON TABLE public.office_cv_skills TO authenticated;
GRANT UPDATE ON TABLE public.office_cv_skills TO authenticated;
GRANT DELETE ON TABLE public.office_cv_skills TO service_role;
GRANT INSERT ON TABLE public.office_cv_skills TO service_role;
GRANT MAINTAIN ON TABLE public.office_cv_skills TO service_role;
GRANT REFERENCES ON TABLE public.office_cv_skills TO service_role;
GRANT SELECT ON TABLE public.office_cv_skills TO service_role;
GRANT TRIGGER ON TABLE public.office_cv_skills TO service_role;
GRANT TRUNCATE ON TABLE public.office_cv_skills TO service_role;
GRANT UPDATE ON TABLE public.office_cv_skills TO service_role;

REVOKE ALL ON TABLE public.office_education FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_education TO anon;
GRANT INSERT ON TABLE public.office_education TO anon;
GRANT MAINTAIN ON TABLE public.office_education TO anon;
GRANT REFERENCES ON TABLE public.office_education TO anon;
GRANT SELECT ON TABLE public.office_education TO anon;
GRANT TRIGGER ON TABLE public.office_education TO anon;
GRANT TRUNCATE ON TABLE public.office_education TO anon;
GRANT UPDATE ON TABLE public.office_education TO anon;
GRANT DELETE ON TABLE public.office_education TO authenticated;
GRANT INSERT ON TABLE public.office_education TO authenticated;
GRANT MAINTAIN ON TABLE public.office_education TO authenticated;
GRANT REFERENCES ON TABLE public.office_education TO authenticated;
GRANT SELECT ON TABLE public.office_education TO authenticated;
GRANT TRIGGER ON TABLE public.office_education TO authenticated;
GRANT TRUNCATE ON TABLE public.office_education TO authenticated;
GRANT UPDATE ON TABLE public.office_education TO authenticated;
GRANT DELETE ON TABLE public.office_education TO service_role;
GRANT INSERT ON TABLE public.office_education TO service_role;
GRANT MAINTAIN ON TABLE public.office_education TO service_role;
GRANT REFERENCES ON TABLE public.office_education TO service_role;
GRANT SELECT ON TABLE public.office_education TO service_role;
GRANT TRIGGER ON TABLE public.office_education TO service_role;
GRANT TRUNCATE ON TABLE public.office_education TO service_role;
GRANT UPDATE ON TABLE public.office_education TO service_role;

REVOKE ALL ON TABLE public.office_experiences FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_experiences TO anon;
GRANT INSERT ON TABLE public.office_experiences TO anon;
GRANT MAINTAIN ON TABLE public.office_experiences TO anon;
GRANT REFERENCES ON TABLE public.office_experiences TO anon;
GRANT SELECT ON TABLE public.office_experiences TO anon;
GRANT TRIGGER ON TABLE public.office_experiences TO anon;
GRANT TRUNCATE ON TABLE public.office_experiences TO anon;
GRANT UPDATE ON TABLE public.office_experiences TO anon;
GRANT DELETE ON TABLE public.office_experiences TO authenticated;
GRANT INSERT ON TABLE public.office_experiences TO authenticated;
GRANT MAINTAIN ON TABLE public.office_experiences TO authenticated;
GRANT REFERENCES ON TABLE public.office_experiences TO authenticated;
GRANT SELECT ON TABLE public.office_experiences TO authenticated;
GRANT TRIGGER ON TABLE public.office_experiences TO authenticated;
GRANT TRUNCATE ON TABLE public.office_experiences TO authenticated;
GRANT UPDATE ON TABLE public.office_experiences TO authenticated;
GRANT DELETE ON TABLE public.office_experiences TO service_role;
GRANT INSERT ON TABLE public.office_experiences TO service_role;
GRANT MAINTAIN ON TABLE public.office_experiences TO service_role;
GRANT REFERENCES ON TABLE public.office_experiences TO service_role;
GRANT SELECT ON TABLE public.office_experiences TO service_role;
GRANT TRIGGER ON TABLE public.office_experiences TO service_role;
GRANT TRUNCATE ON TABLE public.office_experiences TO service_role;
GRANT UPDATE ON TABLE public.office_experiences TO service_role;

REVOKE ALL ON TABLE public.office_files FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_files TO anon;
GRANT INSERT ON TABLE public.office_files TO anon;
GRANT MAINTAIN ON TABLE public.office_files TO anon;
GRANT REFERENCES ON TABLE public.office_files TO anon;
GRANT SELECT ON TABLE public.office_files TO anon;
GRANT TRIGGER ON TABLE public.office_files TO anon;
GRANT TRUNCATE ON TABLE public.office_files TO anon;
GRANT UPDATE ON TABLE public.office_files TO anon;
GRANT DELETE ON TABLE public.office_files TO authenticated;
GRANT INSERT ON TABLE public.office_files TO authenticated;
GRANT MAINTAIN ON TABLE public.office_files TO authenticated;
GRANT REFERENCES ON TABLE public.office_files TO authenticated;
GRANT SELECT ON TABLE public.office_files TO authenticated;
GRANT TRIGGER ON TABLE public.office_files TO authenticated;
GRANT TRUNCATE ON TABLE public.office_files TO authenticated;
GRANT UPDATE ON TABLE public.office_files TO authenticated;
GRANT DELETE ON TABLE public.office_files TO service_role;
GRANT INSERT ON TABLE public.office_files TO service_role;
GRANT MAINTAIN ON TABLE public.office_files TO service_role;
GRANT REFERENCES ON TABLE public.office_files TO service_role;
GRANT SELECT ON TABLE public.office_files TO service_role;
GRANT TRIGGER ON TABLE public.office_files TO service_role;
GRANT TRUNCATE ON TABLE public.office_files TO service_role;
GRANT UPDATE ON TABLE public.office_files TO service_role;

REVOKE ALL ON TABLE public.office_ideas FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_ideas TO anon;
GRANT INSERT ON TABLE public.office_ideas TO anon;
GRANT MAINTAIN ON TABLE public.office_ideas TO anon;
GRANT REFERENCES ON TABLE public.office_ideas TO anon;
GRANT SELECT ON TABLE public.office_ideas TO anon;
GRANT TRIGGER ON TABLE public.office_ideas TO anon;
GRANT TRUNCATE ON TABLE public.office_ideas TO anon;
GRANT UPDATE ON TABLE public.office_ideas TO anon;
GRANT DELETE ON TABLE public.office_ideas TO authenticated;
GRANT INSERT ON TABLE public.office_ideas TO authenticated;
GRANT MAINTAIN ON TABLE public.office_ideas TO authenticated;
GRANT REFERENCES ON TABLE public.office_ideas TO authenticated;
GRANT SELECT ON TABLE public.office_ideas TO authenticated;
GRANT TRIGGER ON TABLE public.office_ideas TO authenticated;
GRANT TRUNCATE ON TABLE public.office_ideas TO authenticated;
GRANT UPDATE ON TABLE public.office_ideas TO authenticated;
GRANT DELETE ON TABLE public.office_ideas TO service_role;
GRANT INSERT ON TABLE public.office_ideas TO service_role;
GRANT MAINTAIN ON TABLE public.office_ideas TO service_role;
GRANT REFERENCES ON TABLE public.office_ideas TO service_role;
GRANT SELECT ON TABLE public.office_ideas TO service_role;
GRANT TRIGGER ON TABLE public.office_ideas TO service_role;
GRANT TRUNCATE ON TABLE public.office_ideas TO service_role;
GRANT UPDATE ON TABLE public.office_ideas TO service_role;

REVOKE ALL ON TABLE public.office_languages FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_languages TO anon;
GRANT INSERT ON TABLE public.office_languages TO anon;
GRANT MAINTAIN ON TABLE public.office_languages TO anon;
GRANT REFERENCES ON TABLE public.office_languages TO anon;
GRANT SELECT ON TABLE public.office_languages TO anon;
GRANT TRIGGER ON TABLE public.office_languages TO anon;
GRANT TRUNCATE ON TABLE public.office_languages TO anon;
GRANT UPDATE ON TABLE public.office_languages TO anon;
GRANT DELETE ON TABLE public.office_languages TO authenticated;
GRANT INSERT ON TABLE public.office_languages TO authenticated;
GRANT MAINTAIN ON TABLE public.office_languages TO authenticated;
GRANT REFERENCES ON TABLE public.office_languages TO authenticated;
GRANT SELECT ON TABLE public.office_languages TO authenticated;
GRANT TRIGGER ON TABLE public.office_languages TO authenticated;
GRANT TRUNCATE ON TABLE public.office_languages TO authenticated;
GRANT UPDATE ON TABLE public.office_languages TO authenticated;
GRANT DELETE ON TABLE public.office_languages TO service_role;
GRANT INSERT ON TABLE public.office_languages TO service_role;
GRANT MAINTAIN ON TABLE public.office_languages TO service_role;
GRANT REFERENCES ON TABLE public.office_languages TO service_role;
GRANT SELECT ON TABLE public.office_languages TO service_role;
GRANT TRIGGER ON TABLE public.office_languages TO service_role;
GRANT TRUNCATE ON TABLE public.office_languages TO service_role;
GRANT UPDATE ON TABLE public.office_languages TO service_role;

REVOKE ALL ON TABLE public.office_learning_tracks FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_learning_tracks TO anon;
GRANT INSERT ON TABLE public.office_learning_tracks TO anon;
GRANT MAINTAIN ON TABLE public.office_learning_tracks TO anon;
GRANT REFERENCES ON TABLE public.office_learning_tracks TO anon;
GRANT SELECT ON TABLE public.office_learning_tracks TO anon;
GRANT TRIGGER ON TABLE public.office_learning_tracks TO anon;
GRANT TRUNCATE ON TABLE public.office_learning_tracks TO anon;
GRANT UPDATE ON TABLE public.office_learning_tracks TO anon;
GRANT DELETE ON TABLE public.office_learning_tracks TO authenticated;
GRANT INSERT ON TABLE public.office_learning_tracks TO authenticated;
GRANT MAINTAIN ON TABLE public.office_learning_tracks TO authenticated;
GRANT REFERENCES ON TABLE public.office_learning_tracks TO authenticated;
GRANT SELECT ON TABLE public.office_learning_tracks TO authenticated;
GRANT TRIGGER ON TABLE public.office_learning_tracks TO authenticated;
GRANT TRUNCATE ON TABLE public.office_learning_tracks TO authenticated;
GRANT UPDATE ON TABLE public.office_learning_tracks TO authenticated;
GRANT DELETE ON TABLE public.office_learning_tracks TO service_role;
GRANT INSERT ON TABLE public.office_learning_tracks TO service_role;
GRANT MAINTAIN ON TABLE public.office_learning_tracks TO service_role;
GRANT REFERENCES ON TABLE public.office_learning_tracks TO service_role;
GRANT SELECT ON TABLE public.office_learning_tracks TO service_role;
GRANT TRIGGER ON TABLE public.office_learning_tracks TO service_role;
GRANT TRUNCATE ON TABLE public.office_learning_tracks TO service_role;
GRANT UPDATE ON TABLE public.office_learning_tracks TO service_role;

REVOKE ALL ON TABLE public.office_nodes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_nodes TO anon;
GRANT INSERT ON TABLE public.office_nodes TO anon;
GRANT MAINTAIN ON TABLE public.office_nodes TO anon;
GRANT REFERENCES ON TABLE public.office_nodes TO anon;
GRANT SELECT ON TABLE public.office_nodes TO anon;
GRANT TRIGGER ON TABLE public.office_nodes TO anon;
GRANT TRUNCATE ON TABLE public.office_nodes TO anon;
GRANT UPDATE ON TABLE public.office_nodes TO anon;
GRANT DELETE ON TABLE public.office_nodes TO authenticated;
GRANT INSERT ON TABLE public.office_nodes TO authenticated;
GRANT MAINTAIN ON TABLE public.office_nodes TO authenticated;
GRANT REFERENCES ON TABLE public.office_nodes TO authenticated;
GRANT SELECT ON TABLE public.office_nodes TO authenticated;
GRANT TRIGGER ON TABLE public.office_nodes TO authenticated;
GRANT TRUNCATE ON TABLE public.office_nodes TO authenticated;
GRANT UPDATE ON TABLE public.office_nodes TO authenticated;
GRANT DELETE ON TABLE public.office_nodes TO service_role;
GRANT INSERT ON TABLE public.office_nodes TO service_role;
GRANT MAINTAIN ON TABLE public.office_nodes TO service_role;
GRANT REFERENCES ON TABLE public.office_nodes TO service_role;
GRANT SELECT ON TABLE public.office_nodes TO service_role;
GRANT TRIGGER ON TABLE public.office_nodes TO service_role;
GRANT TRUNCATE ON TABLE public.office_nodes TO service_role;
GRANT UPDATE ON TABLE public.office_nodes TO service_role;

REVOKE ALL ON TABLE public.office_notes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_notes TO anon;
GRANT INSERT ON TABLE public.office_notes TO anon;
GRANT MAINTAIN ON TABLE public.office_notes TO anon;
GRANT REFERENCES ON TABLE public.office_notes TO anon;
GRANT SELECT ON TABLE public.office_notes TO anon;
GRANT TRIGGER ON TABLE public.office_notes TO anon;
GRANT TRUNCATE ON TABLE public.office_notes TO anon;
GRANT UPDATE ON TABLE public.office_notes TO anon;
GRANT DELETE ON TABLE public.office_notes TO authenticated;
GRANT INSERT ON TABLE public.office_notes TO authenticated;
GRANT MAINTAIN ON TABLE public.office_notes TO authenticated;
GRANT REFERENCES ON TABLE public.office_notes TO authenticated;
GRANT SELECT ON TABLE public.office_notes TO authenticated;
GRANT TRIGGER ON TABLE public.office_notes TO authenticated;
GRANT TRUNCATE ON TABLE public.office_notes TO authenticated;
GRANT UPDATE ON TABLE public.office_notes TO authenticated;
GRANT DELETE ON TABLE public.office_notes TO service_role;
GRANT INSERT ON TABLE public.office_notes TO service_role;
GRANT MAINTAIN ON TABLE public.office_notes TO service_role;
GRANT REFERENCES ON TABLE public.office_notes TO service_role;
GRANT SELECT ON TABLE public.office_notes TO service_role;
GRANT TRIGGER ON TABLE public.office_notes TO service_role;
GRANT TRUNCATE ON TABLE public.office_notes TO service_role;
GRANT UPDATE ON TABLE public.office_notes TO service_role;

REVOKE ALL ON TABLE public.office_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_profiles TO anon;
GRANT INSERT ON TABLE public.office_profiles TO anon;
GRANT MAINTAIN ON TABLE public.office_profiles TO anon;
GRANT REFERENCES ON TABLE public.office_profiles TO anon;
GRANT SELECT ON TABLE public.office_profiles TO anon;
GRANT TRIGGER ON TABLE public.office_profiles TO anon;
GRANT TRUNCATE ON TABLE public.office_profiles TO anon;
GRANT UPDATE ON TABLE public.office_profiles TO anon;
GRANT DELETE ON TABLE public.office_profiles TO authenticated;
GRANT INSERT ON TABLE public.office_profiles TO authenticated;
GRANT MAINTAIN ON TABLE public.office_profiles TO authenticated;
GRANT REFERENCES ON TABLE public.office_profiles TO authenticated;
GRANT SELECT ON TABLE public.office_profiles TO authenticated;
GRANT TRIGGER ON TABLE public.office_profiles TO authenticated;
GRANT TRUNCATE ON TABLE public.office_profiles TO authenticated;
GRANT UPDATE ON TABLE public.office_profiles TO authenticated;
GRANT DELETE ON TABLE public.office_profiles TO service_role;
GRANT INSERT ON TABLE public.office_profiles TO service_role;
GRANT MAINTAIN ON TABLE public.office_profiles TO service_role;
GRANT REFERENCES ON TABLE public.office_profiles TO service_role;
GRANT SELECT ON TABLE public.office_profiles TO service_role;
GRANT TRIGGER ON TABLE public.office_profiles TO service_role;
GRANT TRUNCATE ON TABLE public.office_profiles TO service_role;
GRANT UPDATE ON TABLE public.office_profiles TO service_role;

REVOKE ALL ON TABLE public.office_projects FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.office_projects TO anon;
GRANT INSERT ON TABLE public.office_projects TO anon;
GRANT MAINTAIN ON TABLE public.office_projects TO anon;
GRANT REFERENCES ON TABLE public.office_projects TO anon;
GRANT SELECT ON TABLE public.office_projects TO anon;
GRANT TRIGGER ON TABLE public.office_projects TO anon;
GRANT TRUNCATE ON TABLE public.office_projects TO anon;
GRANT UPDATE ON TABLE public.office_projects TO anon;
GRANT DELETE ON TABLE public.office_projects TO authenticated;
GRANT INSERT ON TABLE public.office_projects TO authenticated;
GRANT MAINTAIN ON TABLE public.office_projects TO authenticated;
GRANT REFERENCES ON TABLE public.office_projects TO authenticated;
GRANT SELECT ON TABLE public.office_projects TO authenticated;
GRANT TRIGGER ON TABLE public.office_projects TO authenticated;
GRANT TRUNCATE ON TABLE public.office_projects TO authenticated;
GRANT UPDATE ON TABLE public.office_projects TO authenticated;
GRANT DELETE ON TABLE public.office_projects TO service_role;
GRANT INSERT ON TABLE public.office_projects TO service_role;
GRANT MAINTAIN ON TABLE public.office_projects TO service_role;
GRANT REFERENCES ON TABLE public.office_projects TO service_role;
GRANT SELECT ON TABLE public.office_projects TO service_role;
GRANT TRIGGER ON TABLE public.office_projects TO service_role;
GRANT TRUNCATE ON TABLE public.office_projects TO service_role;
GRANT UPDATE ON TABLE public.office_projects TO service_role;

REVOKE ALL ON TABLE public.page_image_annotations FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.page_image_annotations TO anon;
GRANT REFERENCES ON TABLE public.page_image_annotations TO anon;
GRANT SELECT ON TABLE public.page_image_annotations TO anon;
GRANT TRIGGER ON TABLE public.page_image_annotations TO anon;
GRANT MAINTAIN ON TABLE public.page_image_annotations TO authenticated;
GRANT REFERENCES ON TABLE public.page_image_annotations TO authenticated;
GRANT SELECT ON TABLE public.page_image_annotations TO authenticated;
GRANT TRIGGER ON TABLE public.page_image_annotations TO authenticated;
GRANT DELETE ON TABLE public.page_image_annotations TO service_role;
GRANT INSERT ON TABLE public.page_image_annotations TO service_role;
GRANT MAINTAIN ON TABLE public.page_image_annotations TO service_role;
GRANT REFERENCES ON TABLE public.page_image_annotations TO service_role;
GRANT SELECT ON TABLE public.page_image_annotations TO service_role;
GRANT TRIGGER ON TABLE public.page_image_annotations TO service_role;
GRANT UPDATE ON TABLE public.page_image_annotations TO service_role;

REVOKE ALL ON TABLE public.post_comments FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.post_comments TO anon;
GRANT INSERT ON TABLE public.post_comments TO anon;
GRANT MAINTAIN ON TABLE public.post_comments TO anon;
GRANT REFERENCES ON TABLE public.post_comments TO anon;
GRANT SELECT ON TABLE public.post_comments TO anon;
GRANT TRIGGER ON TABLE public.post_comments TO anon;
GRANT TRUNCATE ON TABLE public.post_comments TO anon;
GRANT UPDATE ON TABLE public.post_comments TO anon;
GRANT DELETE ON TABLE public.post_comments TO authenticated;
GRANT INSERT ON TABLE public.post_comments TO authenticated;
GRANT MAINTAIN ON TABLE public.post_comments TO authenticated;
GRANT REFERENCES ON TABLE public.post_comments TO authenticated;
GRANT SELECT ON TABLE public.post_comments TO authenticated;
GRANT TRIGGER ON TABLE public.post_comments TO authenticated;
GRANT TRUNCATE ON TABLE public.post_comments TO authenticated;
GRANT UPDATE ON TABLE public.post_comments TO authenticated;
GRANT DELETE ON TABLE public.post_comments TO service_role;
GRANT INSERT ON TABLE public.post_comments TO service_role;
GRANT MAINTAIN ON TABLE public.post_comments TO service_role;
GRANT REFERENCES ON TABLE public.post_comments TO service_role;
GRANT SELECT ON TABLE public.post_comments TO service_role;
GRANT TRIGGER ON TABLE public.post_comments TO service_role;
GRANT TRUNCATE ON TABLE public.post_comments TO service_role;
GRANT UPDATE ON TABLE public.post_comments TO service_role;

REVOKE ALL ON TABLE public.post_likes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.post_likes TO anon;
GRANT INSERT ON TABLE public.post_likes TO anon;
GRANT MAINTAIN ON TABLE public.post_likes TO anon;
GRANT REFERENCES ON TABLE public.post_likes TO anon;
GRANT SELECT ON TABLE public.post_likes TO anon;
GRANT TRIGGER ON TABLE public.post_likes TO anon;
GRANT TRUNCATE ON TABLE public.post_likes TO anon;
GRANT UPDATE ON TABLE public.post_likes TO anon;
GRANT DELETE ON TABLE public.post_likes TO authenticated;
GRANT INSERT ON TABLE public.post_likes TO authenticated;
GRANT MAINTAIN ON TABLE public.post_likes TO authenticated;
GRANT REFERENCES ON TABLE public.post_likes TO authenticated;
GRANT SELECT ON TABLE public.post_likes TO authenticated;
GRANT TRIGGER ON TABLE public.post_likes TO authenticated;
GRANT TRUNCATE ON TABLE public.post_likes TO authenticated;
GRANT UPDATE ON TABLE public.post_likes TO authenticated;
GRANT DELETE ON TABLE public.post_likes TO service_role;
GRANT INSERT ON TABLE public.post_likes TO service_role;
GRANT MAINTAIN ON TABLE public.post_likes TO service_role;
GRANT REFERENCES ON TABLE public.post_likes TO service_role;
GRANT SELECT ON TABLE public.post_likes TO service_role;
GRANT TRIGGER ON TABLE public.post_likes TO service_role;
GRANT TRUNCATE ON TABLE public.post_likes TO service_role;
GRANT UPDATE ON TABLE public.post_likes TO service_role;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.profiles TO anon;
GRANT INSERT ON TABLE public.profiles TO anon;
GRANT MAINTAIN ON TABLE public.profiles TO anon;
GRANT REFERENCES ON TABLE public.profiles TO anon;
GRANT TRIGGER ON TABLE public.profiles TO anon;
GRANT TRUNCATE ON TABLE public.profiles TO anon;
GRANT UPDATE ON TABLE public.profiles TO anon;
GRANT DELETE ON TABLE public.profiles TO authenticated;
GRANT INSERT ON TABLE public.profiles TO authenticated;
GRANT MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT REFERENCES ON TABLE public.profiles TO authenticated;
GRANT TRIGGER ON TABLE public.profiles TO authenticated;
GRANT TRUNCATE ON TABLE public.profiles TO authenticated;
GRANT UPDATE ON TABLE public.profiles TO authenticated;
GRANT DELETE ON TABLE public.profiles TO service_role;
GRANT INSERT ON TABLE public.profiles TO service_role;
GRANT MAINTAIN ON TABLE public.profiles TO service_role;
GRANT REFERENCES ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO service_role;
GRANT TRIGGER ON TABLE public.profiles TO service_role;
GRANT TRUNCATE ON TABLE public.profiles TO service_role;
GRANT UPDATE ON TABLE public.profiles TO service_role;

REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.referrals TO service_role;
GRANT INSERT ON TABLE public.referrals TO service_role;
GRANT MAINTAIN ON TABLE public.referrals TO service_role;
GRANT REFERENCES ON TABLE public.referrals TO service_role;
GRANT SELECT ON TABLE public.referrals TO service_role;
GRANT TRIGGER ON TABLE public.referrals TO service_role;
GRANT TRUNCATE ON TABLE public.referrals TO service_role;
GRANT UPDATE ON TABLE public.referrals TO service_role;

REVOKE ALL ON TABLE public.room_blank_pages FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.room_blank_pages TO anon;
GRANT INSERT ON TABLE public.room_blank_pages TO anon;
GRANT MAINTAIN ON TABLE public.room_blank_pages TO anon;
GRANT REFERENCES ON TABLE public.room_blank_pages TO anon;
GRANT SELECT ON TABLE public.room_blank_pages TO anon;
GRANT TRIGGER ON TABLE public.room_blank_pages TO anon;
GRANT TRUNCATE ON TABLE public.room_blank_pages TO anon;
GRANT UPDATE ON TABLE public.room_blank_pages TO anon;
GRANT DELETE ON TABLE public.room_blank_pages TO authenticated;
GRANT INSERT ON TABLE public.room_blank_pages TO authenticated;
GRANT MAINTAIN ON TABLE public.room_blank_pages TO authenticated;
GRANT REFERENCES ON TABLE public.room_blank_pages TO authenticated;
GRANT SELECT ON TABLE public.room_blank_pages TO authenticated;
GRANT TRIGGER ON TABLE public.room_blank_pages TO authenticated;
GRANT TRUNCATE ON TABLE public.room_blank_pages TO authenticated;
GRANT UPDATE ON TABLE public.room_blank_pages TO authenticated;
GRANT DELETE ON TABLE public.room_blank_pages TO service_role;
GRANT INSERT ON TABLE public.room_blank_pages TO service_role;
GRANT MAINTAIN ON TABLE public.room_blank_pages TO service_role;
GRANT REFERENCES ON TABLE public.room_blank_pages TO service_role;
GRANT SELECT ON TABLE public.room_blank_pages TO service_role;
GRANT TRIGGER ON TABLE public.room_blank_pages TO service_role;
GRANT TRUNCATE ON TABLE public.room_blank_pages TO service_role;
GRANT UPDATE ON TABLE public.room_blank_pages TO service_role;

REVOKE ALL ON TABLE public.room_document_events FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.room_document_events TO authenticated;
GRANT INSERT ON TABLE public.room_document_events TO authenticated;
GRANT MAINTAIN ON TABLE public.room_document_events TO authenticated;
GRANT REFERENCES ON TABLE public.room_document_events TO authenticated;
GRANT SELECT ON TABLE public.room_document_events TO authenticated;
GRANT TRIGGER ON TABLE public.room_document_events TO authenticated;
GRANT TRUNCATE ON TABLE public.room_document_events TO authenticated;
GRANT UPDATE ON TABLE public.room_document_events TO authenticated;
GRANT DELETE ON TABLE public.room_document_events TO service_role;
GRANT INSERT ON TABLE public.room_document_events TO service_role;
GRANT MAINTAIN ON TABLE public.room_document_events TO service_role;
GRANT REFERENCES ON TABLE public.room_document_events TO service_role;
GRANT SELECT ON TABLE public.room_document_events TO service_role;
GRANT TRIGGER ON TABLE public.room_document_events TO service_role;
GRANT TRUNCATE ON TABLE public.room_document_events TO service_role;
GRANT UPDATE ON TABLE public.room_document_events TO service_role;

REVOKE ALL ON SEQUENCE public.room_document_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON SEQUENCE public.room_document_events_id_seq TO anon;
GRANT UPDATE ON SEQUENCE public.room_document_events_id_seq TO anon;
GRANT USAGE ON SEQUENCE public.room_document_events_id_seq TO anon;
GRANT SELECT ON SEQUENCE public.room_document_events_id_seq TO authenticated;
GRANT UPDATE ON SEQUENCE public.room_document_events_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.room_document_events_id_seq TO authenticated;
GRANT SELECT ON SEQUENCE public.room_document_events_id_seq TO service_role;
GRANT UPDATE ON SEQUENCE public.room_document_events_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.room_document_events_id_seq TO service_role;

REVOKE ALL ON TABLE public.room_drawings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.room_drawings TO authenticated;
GRANT INSERT ON TABLE public.room_drawings TO authenticated;
GRANT SELECT ON TABLE public.room_drawings TO authenticated;
GRANT UPDATE ON TABLE public.room_drawings TO authenticated;
GRANT DELETE ON TABLE public.room_drawings TO service_role;
GRANT INSERT ON TABLE public.room_drawings TO service_role;
GRANT MAINTAIN ON TABLE public.room_drawings TO service_role;
GRANT REFERENCES ON TABLE public.room_drawings TO service_role;
GRANT SELECT ON TABLE public.room_drawings TO service_role;
GRANT TRIGGER ON TABLE public.room_drawings TO service_role;
GRANT TRUNCATE ON TABLE public.room_drawings TO service_role;
GRANT UPDATE ON TABLE public.room_drawings TO service_role;

REVOKE ALL ON TABLE public.room_invitations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.room_invitations TO authenticated;
GRANT DELETE ON TABLE public.room_invitations TO service_role;
GRANT INSERT ON TABLE public.room_invitations TO service_role;
GRANT MAINTAIN ON TABLE public.room_invitations TO service_role;
GRANT REFERENCES ON TABLE public.room_invitations TO service_role;
GRANT SELECT ON TABLE public.room_invitations TO service_role;
GRANT TRIGGER ON TABLE public.room_invitations TO service_role;
GRANT TRUNCATE ON TABLE public.room_invitations TO service_role;
GRANT UPDATE ON TABLE public.room_invitations TO service_role;

REVOKE ALL ON TABLE public.room_members FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.room_members TO anon;
GRANT INSERT ON TABLE public.room_members TO anon;
GRANT MAINTAIN ON TABLE public.room_members TO anon;
GRANT REFERENCES ON TABLE public.room_members TO anon;
GRANT SELECT ON TABLE public.room_members TO anon;
GRANT TRIGGER ON TABLE public.room_members TO anon;
GRANT TRUNCATE ON TABLE public.room_members TO anon;
GRANT UPDATE ON TABLE public.room_members TO anon;
GRANT DELETE ON TABLE public.room_members TO authenticated;
GRANT INSERT ON TABLE public.room_members TO authenticated;
GRANT MAINTAIN ON TABLE public.room_members TO authenticated;
GRANT REFERENCES ON TABLE public.room_members TO authenticated;
GRANT SELECT ON TABLE public.room_members TO authenticated;
GRANT TRIGGER ON TABLE public.room_members TO authenticated;
GRANT TRUNCATE ON TABLE public.room_members TO authenticated;
GRANT UPDATE ON TABLE public.room_members TO authenticated;
GRANT DELETE ON TABLE public.room_members TO service_role;
GRANT INSERT ON TABLE public.room_members TO service_role;
GRANT MAINTAIN ON TABLE public.room_members TO service_role;
GRANT REFERENCES ON TABLE public.room_members TO service_role;
GRANT SELECT ON TABLE public.room_members TO service_role;
GRANT TRIGGER ON TABLE public.room_members TO service_role;
GRANT TRUNCATE ON TABLE public.room_members TO service_role;
GRANT UPDATE ON TABLE public.room_members TO service_role;

REVOKE ALL ON TABLE public.room_strokes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.room_strokes TO anon;
GRANT INSERT ON TABLE public.room_strokes TO anon;
GRANT MAINTAIN ON TABLE public.room_strokes TO anon;
GRANT REFERENCES ON TABLE public.room_strokes TO anon;
GRANT SELECT ON TABLE public.room_strokes TO anon;
GRANT TRIGGER ON TABLE public.room_strokes TO anon;
GRANT TRUNCATE ON TABLE public.room_strokes TO anon;
GRANT UPDATE ON TABLE public.room_strokes TO anon;
GRANT DELETE ON TABLE public.room_strokes TO authenticated;
GRANT INSERT ON TABLE public.room_strokes TO authenticated;
GRANT MAINTAIN ON TABLE public.room_strokes TO authenticated;
GRANT REFERENCES ON TABLE public.room_strokes TO authenticated;
GRANT SELECT ON TABLE public.room_strokes TO authenticated;
GRANT TRIGGER ON TABLE public.room_strokes TO authenticated;
GRANT TRUNCATE ON TABLE public.room_strokes TO authenticated;
GRANT UPDATE ON TABLE public.room_strokes TO authenticated;
GRANT DELETE ON TABLE public.room_strokes TO service_role;
GRANT INSERT ON TABLE public.room_strokes TO service_role;
GRANT MAINTAIN ON TABLE public.room_strokes TO service_role;
GRANT REFERENCES ON TABLE public.room_strokes TO service_role;
GRANT SELECT ON TABLE public.room_strokes TO service_role;
GRANT TRIGGER ON TABLE public.room_strokes TO service_role;
GRANT TRUNCATE ON TABLE public.room_strokes TO service_role;
GRANT UPDATE ON TABLE public.room_strokes TO service_role;

REVOKE ALL ON SEQUENCE public.room_strokes_seq_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON SEQUENCE public.room_strokes_seq_seq TO anon;
GRANT UPDATE ON SEQUENCE public.room_strokes_seq_seq TO anon;
GRANT USAGE ON SEQUENCE public.room_strokes_seq_seq TO anon;
GRANT SELECT ON SEQUENCE public.room_strokes_seq_seq TO authenticated;
GRANT UPDATE ON SEQUENCE public.room_strokes_seq_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.room_strokes_seq_seq TO authenticated;
GRANT SELECT ON SEQUENCE public.room_strokes_seq_seq TO service_role;
GRANT UPDATE ON SEQUENCE public.room_strokes_seq_seq TO service_role;
GRANT USAGE ON SEQUENCE public.room_strokes_seq_seq TO service_role;

REVOKE ALL ON TABLE public.room_voice_notes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.room_voice_notes TO anon;
GRANT INSERT ON TABLE public.room_voice_notes TO anon;
GRANT MAINTAIN ON TABLE public.room_voice_notes TO anon;
GRANT REFERENCES ON TABLE public.room_voice_notes TO anon;
GRANT SELECT ON TABLE public.room_voice_notes TO anon;
GRANT TRIGGER ON TABLE public.room_voice_notes TO anon;
GRANT UPDATE ON TABLE public.room_voice_notes TO anon;
GRANT DELETE ON TABLE public.room_voice_notes TO authenticated;
GRANT INSERT ON TABLE public.room_voice_notes TO authenticated;
GRANT MAINTAIN ON TABLE public.room_voice_notes TO authenticated;
GRANT REFERENCES ON TABLE public.room_voice_notes TO authenticated;
GRANT SELECT ON TABLE public.room_voice_notes TO authenticated;
GRANT TRIGGER ON TABLE public.room_voice_notes TO authenticated;
GRANT UPDATE ON TABLE public.room_voice_notes TO authenticated;
GRANT DELETE ON TABLE public.room_voice_notes TO service_role;
GRANT INSERT ON TABLE public.room_voice_notes TO service_role;
GRANT MAINTAIN ON TABLE public.room_voice_notes TO service_role;
GRANT REFERENCES ON TABLE public.room_voice_notes TO service_role;
GRANT SELECT ON TABLE public.room_voice_notes TO service_role;
GRANT TRIGGER ON TABLE public.room_voice_notes TO service_role;
GRANT UPDATE ON TABLE public.room_voice_notes TO service_role;

REVOKE ALL ON TABLE public.session_state FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.session_state TO anon;
GRANT REFERENCES ON TABLE public.session_state TO anon;
GRANT SELECT ON TABLE public.session_state TO anon;
GRANT TRIGGER ON TABLE public.session_state TO anon;
GRANT MAINTAIN ON TABLE public.session_state TO authenticated;
GRANT REFERENCES ON TABLE public.session_state TO authenticated;
GRANT SELECT ON TABLE public.session_state TO authenticated;
GRANT TRIGGER ON TABLE public.session_state TO authenticated;
GRANT DELETE ON TABLE public.session_state TO service_role;
GRANT INSERT ON TABLE public.session_state TO service_role;
GRANT MAINTAIN ON TABLE public.session_state TO service_role;
GRANT REFERENCES ON TABLE public.session_state TO service_role;
GRANT SELECT ON TABLE public.session_state TO service_role;
GRANT TRIGGER ON TABLE public.session_state TO service_role;
GRANT UPDATE ON TABLE public.session_state TO service_role;

REVOKE ALL ON TABLE public.study_rooms FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.study_rooms TO authenticated;
GRANT INSERT ON TABLE public.study_rooms TO authenticated;
GRANT MAINTAIN ON TABLE public.study_rooms TO authenticated;
GRANT REFERENCES ON TABLE public.study_rooms TO authenticated;
GRANT SELECT ON TABLE public.study_rooms TO authenticated;
GRANT TRIGGER ON TABLE public.study_rooms TO authenticated;
GRANT TRUNCATE ON TABLE public.study_rooms TO authenticated;
GRANT UPDATE ON TABLE public.study_rooms TO authenticated;
GRANT DELETE ON TABLE public.study_rooms TO service_role;
GRANT INSERT ON TABLE public.study_rooms TO service_role;
GRANT MAINTAIN ON TABLE public.study_rooms TO service_role;
GRANT REFERENCES ON TABLE public.study_rooms TO service_role;
GRANT SELECT ON TABLE public.study_rooms TO service_role;
GRANT TRIGGER ON TABLE public.study_rooms TO service_role;
GRANT TRUNCATE ON TABLE public.study_rooms TO service_role;
GRANT UPDATE ON TABLE public.study_rooms TO service_role;

REVOKE ALL ON TABLE public.study_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.study_sessions TO anon;
GRANT INSERT ON TABLE public.study_sessions TO anon;
GRANT MAINTAIN ON TABLE public.study_sessions TO anon;
GRANT REFERENCES ON TABLE public.study_sessions TO anon;
GRANT SELECT ON TABLE public.study_sessions TO anon;
GRANT TRIGGER ON TABLE public.study_sessions TO anon;
GRANT UPDATE ON TABLE public.study_sessions TO anon;
GRANT DELETE ON TABLE public.study_sessions TO authenticated;
GRANT INSERT ON TABLE public.study_sessions TO authenticated;
GRANT MAINTAIN ON TABLE public.study_sessions TO authenticated;
GRANT REFERENCES ON TABLE public.study_sessions TO authenticated;
GRANT SELECT ON TABLE public.study_sessions TO authenticated;
GRANT TRIGGER ON TABLE public.study_sessions TO authenticated;
GRANT UPDATE ON TABLE public.study_sessions TO authenticated;
GRANT DELETE ON TABLE public.study_sessions TO service_role;
GRANT INSERT ON TABLE public.study_sessions TO service_role;
GRANT MAINTAIN ON TABLE public.study_sessions TO service_role;
GRANT REFERENCES ON TABLE public.study_sessions TO service_role;
GRANT SELECT ON TABLE public.study_sessions TO service_role;
GRANT TRIGGER ON TABLE public.study_sessions TO service_role;
GRANT UPDATE ON TABLE public.study_sessions TO service_role;

REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.subscriptions TO service_role;
GRANT INSERT ON TABLE public.subscriptions TO service_role;
GRANT MAINTAIN ON TABLE public.subscriptions TO service_role;
GRANT REFERENCES ON TABLE public.subscriptions TO service_role;
GRANT SELECT ON TABLE public.subscriptions TO service_role;
GRANT TRIGGER ON TABLE public.subscriptions TO service_role;
GRANT TRUNCATE ON TABLE public.subscriptions TO service_role;
GRANT UPDATE ON TABLE public.subscriptions TO service_role;

REVOKE ALL ON TABLE public.text_notes FROM PUBLIC, anon, authenticated, service_role;
GRANT MAINTAIN ON TABLE public.text_notes TO anon;
GRANT REFERENCES ON TABLE public.text_notes TO anon;
GRANT SELECT ON TABLE public.text_notes TO anon;
GRANT TRIGGER ON TABLE public.text_notes TO anon;
GRANT MAINTAIN ON TABLE public.text_notes TO authenticated;
GRANT REFERENCES ON TABLE public.text_notes TO authenticated;
GRANT SELECT ON TABLE public.text_notes TO authenticated;
GRANT TRIGGER ON TABLE public.text_notes TO authenticated;
GRANT DELETE ON TABLE public.text_notes TO service_role;
GRANT INSERT ON TABLE public.text_notes TO service_role;
GRANT MAINTAIN ON TABLE public.text_notes TO service_role;
GRANT REFERENCES ON TABLE public.text_notes TO service_role;
GRANT SELECT ON TABLE public.text_notes TO service_role;
GRANT TRIGGER ON TABLE public.text_notes TO service_role;
GRANT UPDATE ON TABLE public.text_notes TO service_role;

REVOKE ALL ON TABLE public.user_preferences FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.user_preferences TO anon;
GRANT INSERT ON TABLE public.user_preferences TO anon;
GRANT MAINTAIN ON TABLE public.user_preferences TO anon;
GRANT REFERENCES ON TABLE public.user_preferences TO anon;
GRANT SELECT ON TABLE public.user_preferences TO anon;
GRANT TRIGGER ON TABLE public.user_preferences TO anon;
GRANT TRUNCATE ON TABLE public.user_preferences TO anon;
GRANT UPDATE ON TABLE public.user_preferences TO anon;
GRANT DELETE ON TABLE public.user_preferences TO authenticated;
GRANT INSERT ON TABLE public.user_preferences TO authenticated;
GRANT MAINTAIN ON TABLE public.user_preferences TO authenticated;
GRANT REFERENCES ON TABLE public.user_preferences TO authenticated;
GRANT SELECT ON TABLE public.user_preferences TO authenticated;
GRANT TRIGGER ON TABLE public.user_preferences TO authenticated;
GRANT TRUNCATE ON TABLE public.user_preferences TO authenticated;
GRANT UPDATE ON TABLE public.user_preferences TO authenticated;
GRANT DELETE ON TABLE public.user_preferences TO service_role;
GRANT INSERT ON TABLE public.user_preferences TO service_role;
GRANT MAINTAIN ON TABLE public.user_preferences TO service_role;
GRANT REFERENCES ON TABLE public.user_preferences TO service_role;
GRANT SELECT ON TABLE public.user_preferences TO service_role;
GRANT TRIGGER ON TABLE public.user_preferences TO service_role;
GRANT TRUNCATE ON TABLE public.user_preferences TO service_role;
GRANT UPDATE ON TABLE public.user_preferences TO service_role;

REVOKE ALL ON TABLE public.user_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.user_settings TO anon;
GRANT INSERT ON TABLE public.user_settings TO anon;
GRANT MAINTAIN ON TABLE public.user_settings TO anon;
GRANT REFERENCES ON TABLE public.user_settings TO anon;
GRANT SELECT ON TABLE public.user_settings TO anon;
GRANT TRIGGER ON TABLE public.user_settings TO anon;
GRANT TRUNCATE ON TABLE public.user_settings TO anon;
GRANT UPDATE ON TABLE public.user_settings TO anon;
GRANT DELETE ON TABLE public.user_settings TO authenticated;
GRANT INSERT ON TABLE public.user_settings TO authenticated;
GRANT MAINTAIN ON TABLE public.user_settings TO authenticated;
GRANT REFERENCES ON TABLE public.user_settings TO authenticated;
GRANT SELECT ON TABLE public.user_settings TO authenticated;
GRANT TRIGGER ON TABLE public.user_settings TO authenticated;
GRANT TRUNCATE ON TABLE public.user_settings TO authenticated;
GRANT UPDATE ON TABLE public.user_settings TO authenticated;
GRANT DELETE ON TABLE public.user_settings TO service_role;
GRANT INSERT ON TABLE public.user_settings TO service_role;
GRANT MAINTAIN ON TABLE public.user_settings TO service_role;
GRANT REFERENCES ON TABLE public.user_settings TO service_role;
GRANT SELECT ON TABLE public.user_settings TO service_role;
GRANT TRIGGER ON TABLE public.user_settings TO service_role;
GRANT TRUNCATE ON TABLE public.user_settings TO service_role;
GRANT UPDATE ON TABLE public.user_settings TO service_role;

REVOKE ALL ON TABLE public.voice_notes FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE ON TABLE public.voice_notes TO anon;
GRANT INSERT ON TABLE public.voice_notes TO anon;
GRANT MAINTAIN ON TABLE public.voice_notes TO anon;
GRANT REFERENCES ON TABLE public.voice_notes TO anon;
GRANT SELECT ON TABLE public.voice_notes TO anon;
GRANT TRIGGER ON TABLE public.voice_notes TO anon;
GRANT UPDATE ON TABLE public.voice_notes TO anon;
GRANT DELETE ON TABLE public.voice_notes TO authenticated;
GRANT INSERT ON TABLE public.voice_notes TO authenticated;
GRANT MAINTAIN ON TABLE public.voice_notes TO authenticated;
GRANT REFERENCES ON TABLE public.voice_notes TO authenticated;
GRANT SELECT ON TABLE public.voice_notes TO authenticated;
GRANT TRIGGER ON TABLE public.voice_notes TO authenticated;
GRANT UPDATE ON TABLE public.voice_notes TO authenticated;
GRANT DELETE ON TABLE public.voice_notes TO service_role;
GRANT INSERT ON TABLE public.voice_notes TO service_role;
GRANT MAINTAIN ON TABLE public.voice_notes TO service_role;
GRANT REFERENCES ON TABLE public.voice_notes TO service_role;
GRANT SELECT ON TABLE public.voice_notes TO service_role;
GRANT TRIGGER ON TABLE public.voice_notes TO service_role;
GRANT UPDATE ON TABLE public.voice_notes TO service_role;

REVOKE ALL ON TABLE reconcile_archive.document_children_20261120 FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE recording_private.operations FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE recording_private.untracked_audio_inventory FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE recording_private.untracked_audio_inventory TO service_role;

REVOKE ALL ON TABLE worker_private.recording_worker_token FROM PUBLIC, anon, authenticated, service_role;

GRANT UPDATE (status) ON TABLE public.friendships TO authenticated;

GRANT SELECT (avatar_url) ON TABLE public.profiles TO authenticated;

GRANT SELECT (created_at) ON TABLE public.profiles TO authenticated;

GRANT SELECT (handle) ON TABLE public.profiles TO authenticated;

GRANT SELECT (id) ON TABLE public.profiles TO authenticated;

GRANT SELECT (is_vip) ON TABLE public.profiles TO authenticated;

GRANT SELECT (username) ON TABLE public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.apply_billing_event(p_event_id text, p_created bigint, p_user_id uuid, p_plan text, p_customer_id text, p_subscription_id text, p_status text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_document_generation(p_document_id text, p_generation uuid, p_owner uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_document_generation(p_document_id text, p_generation uuid, p_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_document_generation(p_document_id text, p_generation uuid, p_owner uuid) TO service_role;

REVOKE ALL ON FUNCTION public.begin_recording_operation(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_page text, p_duration numeric, p_mime text, p_size bigint, p_title text, p_recorded_at timestamp with time zone, p_expected_owner uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_recording_operation(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_page text, p_duration numeric, p_mime text, p_size bigint, p_title text, p_recorded_at timestamp with time zone, p_expected_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_recording_operation(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_page text, p_duration numeric, p_mime text, p_size bigint, p_title text, p_recorded_at timestamp with time zone, p_expected_owner uuid) TO service_role;

REVOKE ALL ON FUNCTION public.bump_document_collection_revision() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bump_document_collection_revision() TO service_role;

REVOKE ALL ON FUNCTION public.can_read_pdf_object(p_name text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_pdf_object(p_name text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_read_pdf_object(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_pdf_object(p_name text) TO service_role;

REVOKE ALL ON FUNCTION public.can_view_community_author(p_author uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_community_author(p_author uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_community_author(p_author uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_view_room_members(p_room uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_room_members(p_room uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_room_members(p_room uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_billing_reconciliation(p_subscription_id text, p_event_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_billing_reconciliation(p_subscription_id text, p_event_id text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_recording_operations(p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_recording_operations(p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.clear_account_drawings_v2(p_expected_owner uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_account_drawings_v2(p_expected_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_account_drawings_v2(p_expected_owner uuid) TO service_role;

REVOKE ALL ON FUNCTION public.close_expired_rooms() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_expired_rooms() TO service_role;

REVOKE ALL ON FUNCTION public.commit_billing_reconciliation(p_event_id text, p_created bigint, p_user_id uuid, p_plan text, p_customer_id text, p_subscription_id text, p_status text, p_token uuid, p_subscription_created bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_billing_reconciliation(p_event_id text, p_created bigint, p_user_id uuid, p_plan text, p_customer_id text, p_subscription_id text, p_status text, p_token uuid, p_subscription_created bigint) TO service_role;

REVOKE ALL ON FUNCTION public.complete_ai_request(p_reservation uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_ai_request(p_reservation uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_recording_cleanup(p_id uuid, p_lease uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_recording_cleanup(p_id uuid, p_lease uuid) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_recording_upload(p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_recording_upload(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_recording_upload(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_direct_message_notification() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_direct_message_notification() TO service_role;

REVOKE ALL ON FUNCTION public.create_flashcard_deck_v2(p_name text, p_description text, p_document_id text, p_generation uuid, p_cards jsonb, p_expected_owner uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_flashcard_deck_v2(p_name text, p_description text, p_document_id text, p_generation uuid, p_cards jsonb, p_expected_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_flashcard_deck_v2(p_name text, p_description text, p_document_id text, p_generation uuid, p_cards jsonb, p_expected_owner uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_friend_accepted_notification() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_friend_accepted_notification() TO service_role;

REVOKE ALL ON FUNCTION public.create_friend_request_notification() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_friend_request_notification() TO service_role;

REVOKE ALL ON FUNCTION public.delete_document_recordings(p_document_id text, p_generation uuid, p_expected_owner uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_document_recordings(p_document_id text, p_generation uuid, p_expected_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_document_recordings(p_document_id text, p_generation uuid, p_expected_owner uuid) TO service_role;

REVOKE ALL ON FUNCTION public.delete_recording_identity(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_expected_owner uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_recording_identity(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_expected_owner uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_recording_identity(p_note_id uuid, p_scope text, p_scope_id text, p_generation uuid, p_expected_owner uuid) TO service_role;

REVOKE ALL ON FUNCTION public.delete_user_account(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_account(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.direct_messages_lock_immutable_cols() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.direct_messages_lock_immutable_cols() TO anon;
GRANT EXECUTE ON FUNCTION public.direct_messages_lock_immutable_cols() TO authenticated;
GRANT EXECUTE ON FUNCTION public.direct_messages_lock_immutable_cols() TO service_role;
GRANT EXECUTE ON FUNCTION public.direct_messages_lock_immutable_cols() TO PUBLIC;

REVOKE ALL ON FUNCTION public.document_collection_definition(p_collection text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.document_collection_definition(p_collection text) TO service_role;

REVOKE ALL ON FUNCTION public.expire_referral_rewards() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_referral_rewards() TO service_role;

REVOKE ALL ON FUNCTION public.get_my_private_profile() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO service_role;

REVOKE ALL ON FUNCTION public.get_my_referral_count() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_referral_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_referral_count() TO service_role;

REVOKE ALL ON FUNCTION public.get_recording_operation(p_note_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_recording_operation(p_note_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recording_operation(p_note_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_study_streak(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_study_streak(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_streak(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_study_time_map(p_user_id uuid, p_doc_ids text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_study_time_map(p_user_id uuid, p_doc_ids text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_time_map(p_user_id uuid, p_doc_ids text[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_today_study_seconds(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_today_study_seconds(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_today_study_seconds(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.guard_document_child() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_document_child() TO service_role;

REVOKE ALL ON FUNCTION public.guard_document_lifetime() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_document_lifetime() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.increment_ai_usage(p_user_id uuid, p_month text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(p_user_id uuid, p_month text) TO service_role;

REVOKE ALL ON FUNCTION public.invite_to_room(p_room_id uuid, p_invitee_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invite_to_room(p_room_id uuid, p_invitee_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_to_room(p_room_id uuid, p_invitee_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_handle_available(p_handle text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_handle_available(p_handle text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_handle_available(p_handle text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_handle_available(p_handle text) TO service_role;

REVOKE ALL ON FUNCTION public.join_room_atomic(p_room_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_room_atomic(p_room_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_atomic(p_room_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.leave_room_atomic(p_room_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_room_atomic(p_room_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room_atomic(p_room_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.leave_room_atomic(p_room_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_room_atomic(p_room_id uuid, p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mutual_friend_counts(p_other_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutual_friend_counts(p_other_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mutual_friend_counts(p_other_ids uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.normalize_profile_handle(input text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_profile_handle(input text) TO anon;
GRANT EXECUTE ON FUNCTION public.normalize_profile_handle(input text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_profile_handle(input text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_profile_handle(input text) TO PUBLIC;

REVOKE ALL ON FUNCTION public.office_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.office_set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.office_set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.office_set_updated_at() TO PUBLIC;

REVOKE ALL ON FUNCTION public.prepare_recording_cleanup(p_id uuid, p_lease uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_recording_cleanup(p_id uuid, p_lease uuid) TO service_role;

REVOKE ALL ON FUNCTION public.profiles_lock_privileged_cols() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profiles_lock_privileged_cols() TO anon;
GRANT EXECUTE ON FUNCTION public.profiles_lock_privileged_cols() TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_lock_privileged_cols() TO service_role;
GRANT EXECUTE ON FUNCTION public.profiles_lock_privileged_cols() TO PUBLIC;

REVOKE ALL ON FUNCTION public.publish_claimed_recording(p_id uuid, p_lease uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_claimed_recording(p_id uuid, p_lease uuid) TO service_role;

REVOKE ALL ON FUNCTION public.read_document_collection_v2(p_collection text, p_document_id text, p_generation uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_document_collection_v2(p_collection text, p_document_id text, p_generation uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_document_collection_v2(p_collection text, p_document_id text, p_generation uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_ai_requests(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_requests(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.recording_legacy_playback_allowed(p_path text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recording_legacy_playback_allowed(p_path text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recording_legacy_playback_allowed(p_path text) TO service_role;

REVOKE ALL ON FUNCTION public.recording_playback_path(p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recording_playback_path(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recording_playback_path(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.recording_room_member(p_room uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recording_room_member(p_room uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recording_room_member(p_room uuid) TO service_role;

REVOKE ALL ON FUNCTION public.recording_upload_allowed(p_path text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recording_upload_allowed(p_path text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recording_upload_allowed(p_path text) TO service_role;

REVOKE ALL ON FUNCTION public.recording_worker_token_ok(p_token text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recording_worker_token_ok(p_token text) TO service_role;

REVOKE ALL ON FUNCTION public.redeem_referral(p_user_id uuid, p_code text, p_ip_address text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_referral(p_user_id uuid, p_code text, p_ip_address text) TO service_role;

REVOKE ALL ON FUNCTION public.refund_ai_request(p_reservation uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_request(p_reservation uuid) TO service_role;

REVOKE ALL ON FUNCTION public.release_billing_reconciliation(p_subscription_id text, p_token uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_billing_reconciliation(p_subscription_id text, p_token uuid) TO service_role;

REVOKE ALL ON FUNCTION public.release_recording_lease(p_id uuid, p_lease uuid, p_error text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_recording_lease(p_id uuid, p_lease uuid, p_error text) TO service_role;

REVOKE ALL ON FUNCTION public.rename_recording(p_note_id uuid, p_title text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_recording(p_note_id uuid, p_title text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_recording(p_note_id uuid, p_title text) TO service_role;

REVOKE ALL ON FUNCTION public.replace_study_collection(p_collection text, p_document_id text, p_page_key text, p_rows jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_study_collection(p_collection text, p_document_id text, p_page_key text, p_rows jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.replace_study_collection_v2(p_collection text, p_document_id text, p_generation uuid, p_page_key text, p_expected_revision bigint, p_write_id uuid, p_rows jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_study_collection_v2(p_collection text, p_document_id text, p_generation uuid, p_page_key text, p_expected_revision bigint, p_write_id uuid, p_rows jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_study_collection_v2(p_collection text, p_document_id text, p_generation uuid, p_page_key text, p_expected_revision bigint, p_write_id uuid, p_rows jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.request_recording_deletion(p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_recording_deletion(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_recording_deletion(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_ai_request(p_user_id uuid, p_month text, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_request(p_user_id uuid, p_month text, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_ai_request_v2(p_user_id uuid, p_month text, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_request_v2(p_user_id uuid, p_month text, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_checkout_attempt(p_user_id uuid, p_plan text, p_billing text, p_email text, p_origin text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_attempt(p_user_id uuid, p_plan text, p_billing text, p_email text, p_origin text) TO service_role;

REVOKE ALL ON FUNCTION public.review_flashcard_v2(p_card_id uuid, p_expected_review_count integer, p_rating text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_flashcard_v2(p_card_id uuid, p_expected_review_count integer, p_rating text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_flashcard_v2(p_card_id uuid, p_expected_review_count integer, p_rating text) TO service_role;

REVOKE ALL ON FUNCTION public.save_document_position_v2(p_document_id text, p_generation uuid, p_virtual_index integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_document_position_v2(p_document_id text, p_generation uuid, p_virtual_index integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_document_position_v2(p_document_id text, p_generation uuid, p_virtual_index integer) TO service_role;

REVOKE ALL ON FUNCTION public.schedule_recording_worker(p_base_url text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_users(search_query text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_users(search_query text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(search_query text) TO service_role;

REVOKE ALL ON FUNCTION public.toggle_post_like(p_post_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_post_like(p_post_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_post_like(p_post_id uuid) TO service_role;

REVOKE ALL ON FUNCTION recording_private.bucket_ready() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION recording_private.metadata_deleted() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION recording_private.metadata_guard() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION recording_private.publish(p_id uuid, p_owner uuid, p_lease uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION recording_private.reply(o recording_private.operations) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION recording_private.scope_allowed(p_owner uuid, p_scope text, p_scope_id text, p_generation uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION recording_private.storage_commit_guard() FROM PUBLIC, anon, authenticated, service_role;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'active_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.active_sessions;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'direct_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_blank_pages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_blank_pages;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_document_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_document_events;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_strokes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_strokes;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_voice_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_voice_notes;
  END IF;
END $pub$;

DO $pub$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'study_rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_rooms;
  END IF;
END $pub$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', true, 5242880, '{image/jpeg,image/png,image/webp,image/gif}'::text[]) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('office-files', 'office-files', false, 52428800, NULL) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('pdfs', 'pdfs', false, 104857600, '{application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation}'::text[]) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('voice-notes', 'voice-notes', false, 52428800, '{audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav}'::text[]) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

SELECT cron.schedule('close-expired-rooms', '*/10 * * * *', 'SELECT public.close_expired_rooms();');

SELECT cron.schedule('studysync-expire-referral-rewards', '*/5 * * * *', 'SELECT public.expire_referral_rewards();');

-- studysync-recording-worker: run once per project after deploying the edge function:
-- SELECT public.schedule_recording_worker('https://<project-ref>.supabase.co');
