-- Phase 1: complete, transactional account deletion.

-- A collaborative blank page should survive when its creator deletes their
-- account but another user owns the room. The creator identity is private
-- metadata and may safely be anonymized.
ALTER TABLE public.room_blank_pages ALTER COLUMN created_by DROP NOT NULL;

-- Remove the legacy browser-callable signature before installing the
-- server-only variant below.
DROP FUNCTION IF EXISTS public.delete_user_account();

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO service_role;
