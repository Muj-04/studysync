-- Migration: mutual_friend_counts RPC for the Friends-page redesign
--
-- Given an array of other user ids, returns the count of mutual friends
-- between the caller and each other user. Mutual = both are
-- accepted-status friends with the same third user (excluding the
-- caller and the other user themselves).
--
-- Security:    SECURITY DEFINER is required because friendships SELECT
--              RLS limits each user to seeing their own friendships,
--              and computing mutuals requires reading the *other*
--              user's friendships too. Only aggregate counts are
--              returned — never the friend ids — so no PII leaks.
--              EXECUTE granted only to the authenticated role.
--
-- Idempotent:  CREATE OR REPLACE; safe to re-run.

CREATE OR REPLACE FUNCTION public.mutual_friend_counts(p_other_ids uuid[])
RETURNS TABLE (other_user_id uuid, mutual_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH
    me AS (
      SELECT auth.uid() AS uid
    ),
    -- IDs of all users I am accepted-friends with
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
    -- For each input "other" user, all of their accepted friends
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
$$;

REVOKE ALL ON FUNCTION public.mutual_friend_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutual_friend_counts(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.mutual_friend_counts(uuid[]) IS
  'Returns mutual-friend counts for the Friends page. SECURITY DEFINER to bypass friendships RLS; only aggregate counts are returned (no friend IDs leak). Used by getMutualFriendCounts() in src/lib/supabase/db.ts.';
