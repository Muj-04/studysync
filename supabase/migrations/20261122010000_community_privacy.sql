-- Community / profile data is for signed-in users only, and the
-- "community visibility" privacy setting is enforced by the database.
--
-- Before: profiles (including plan and referral codes), community posts,
-- comments, likes, follows and every user's settings were readable with the
-- public anon key, without signing in. The visibility setting
-- (everyone / friends / only_me) was stored but never enforced.

-- ── Registration still needs the handle check before sign-in ───────────────
-- Make it definer so it keeps working once anon can no longer read profiles.
-- It only returns a boolean.
ALTER FUNCTION public.is_handle_available(text) SECURITY DEFINER;

-- ── Profiles: signed-in only; billing/referral columns are owner-only ──────
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, handle, avatar_url, is_vip, created_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS TABLE (plan text, is_vip boolean, referral_code text, referral_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.plan, p.is_vip, p.referral_code, p.referral_expires_at
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_private_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;

-- ── Who may see a user's community posts ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_community_author(p_author uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
$$;
REVOKE ALL ON FUNCTION public.can_view_community_author(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_community_author(uuid) TO authenticated;

DROP POLICY IF EXISTS "Anyone can read posts" ON public.community_posts;
DROP POLICY IF EXISTS community_posts_select_visible ON public.community_posts;
CREATE POLICY community_posts_select_visible ON public.community_posts
  FOR SELECT TO authenticated USING (public.can_view_community_author(user_id));

-- Comments and likes follow their post's visibility (the subquery is itself
-- filtered by the community_posts policy above).
DROP POLICY IF EXISTS "Anyone can read comments" ON public.post_comments;
DROP POLICY IF EXISTS post_comments_select_visible ON public.post_comments;
CREATE POLICY post_comments_select_visible ON public.post_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_comments.post_id));

DROP POLICY IF EXISTS "Users can insert comments" ON public.post_comments;
CREATE POLICY "Users can insert comments" ON public.post_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_comments.post_id));

DROP POLICY IF EXISTS "Anyone can read likes" ON public.post_likes;
DROP POLICY IF EXISTS post_likes_select_visible ON public.post_likes;
CREATE POLICY post_likes_select_visible ON public.post_likes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_likes.post_id));

DROP POLICY IF EXISTS "Users can like" ON public.post_likes;
CREATE POLICY "Users can like" ON public.post_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_likes.post_id));

-- toggle_post_like is definer: apply the same visibility rule inside it.
CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); already boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.community_posts p
                 WHERE p.id = p_post_id AND public.can_view_community_author(p.user_id)) THEN
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
$function$;

-- ── Follows: signed-in only ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read follows" ON public.follows;
DROP POLICY IF EXISTS follows_select_authenticated ON public.follows;
CREATE POLICY follows_select_authenticated ON public.follows
  FOR SELECT TO authenticated USING (true);

-- ── Settings: owner only (nobody else reads them) ─────────────────────────
DROP POLICY IF EXISTS "Anyone can read community_visibility" ON public.user_settings;
