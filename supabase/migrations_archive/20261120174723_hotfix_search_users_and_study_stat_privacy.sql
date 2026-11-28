-- Applied directly to production (mlyvadsznvyurjakovau) on 2026-11-20 as an emergency hotfix.
-- Already recorded in production's migration history as version 20261120174723.
-- Purpose:
--   * search_users no longer reads auth.users or returns email addresses
--     (any signed-in user could previously enumerate emails, e.g. by searching "@").
--   * get_study_* RPCs only return data for the calling user.
--   * toggle_post_like rejects unauthenticated callers.
--   * anon can no longer execute any SECURITY DEFINER function; trigger functions and
--     the pg_cron-only close_expired_rooms() are not callable through the API at all.
-- Signatures are unchanged, so the July 28 production frontend keeps working.
-- Staging (xokiiepdpjvqnpzwmbtb) already has equivalent fixes via
-- 20261026214832_enforce_study_statistics_rls and 20261026220906_harden_legacy_public_rpcs.

CREATE OR REPLACE FUNCTION public.search_users(search_query text)
RETURNS TABLE(id uuid, username text, email text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE q text := nullif(trim(search_query), '');
BEGIN
  IF auth.uid() IS NULL OR q IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, coalesce(p.username, p.handle), ''::text, p.avatar_url
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND (p.username ILIKE '%' || q || '%' OR p.handle ILIKE '%' || q || '%')
  ORDER BY CASE WHEN p.username ILIKE q || '%' THEN 0 ELSE 1 END,
           coalesce(p.username, p.handle), p.id
  LIMIT 15;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_study_streak(p_user_id uuid DEFAULT auth.uid())
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.get_study_time_map(p_user_id uuid, p_doc_ids text[])
RETURNS TABLE(document_id text, total_seconds bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  select s.document_id, sum(s.duration_seconds)::bigint
  from public.study_sessions s
  where s.user_id = p_user_id and p_user_id = auth.uid()
    and s.ended_at is not null and s.document_id = any(p_doc_ids)
  group by s.document_id
$$;

CREATE OR REPLACE FUNCTION public.get_today_study_seconds(p_user_id uuid DEFAULT auth.uid())
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  select coalesce(sum(duration_seconds)::int, 0)
  from public.study_sessions
  where user_id = p_user_id and p_user_id = auth.uid()
    and ended_at is not null
    and date_trunc('day', started_at) = date_trunc('day', now())
$$;

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); already boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
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
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.search_users(text)',
    'public.get_study_streak(uuid)',
    'public.get_study_time_map(uuid, text[])',
    'public.get_today_study_seconds(uuid)',
    'public.toggle_post_like(uuid)',
    'public.invite_to_room(uuid, uuid)',
    'public.leave_room_atomic(uuid)',
    'public.get_my_referral_count()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.create_direct_message_notification()',
    'public.create_friend_accepted_notification()',
    'public.create_friend_request_notification()',
    'public.close_expired_rooms()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
