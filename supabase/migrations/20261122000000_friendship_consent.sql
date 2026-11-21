-- Friend requests require the receiver's consent.
--
-- Before: INSERT only checked requester_id = auth.uid(), so a caller could
-- insert a row with status = 'accepted' and become "friends" with anyone,
-- which unlocks direct messages and room invites to that person. UPDATE let
-- either side change any column, so a requester could accept their own
-- request or re-point receiver_id.
--
-- After:
--   * new rows must be the caller's own, pending, and not to themselves;
--   * only the receiver can answer, only while pending, only with
--     accepted / rejected;
--   * only the status column is updatable.

DROP POLICY IF EXISTS friendships_insert ON public.friendships;
CREATE POLICY friendships_insert ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> receiver_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS friendships_update ON public.friendships;
CREATE POLICY friendships_update ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id AND status = 'pending')
  WITH CHECK (auth.uid() = receiver_id AND status IN ('accepted', 'rejected'));

REVOKE UPDATE ON public.friendships FROM anon, authenticated;
GRANT UPDATE (status) ON public.friendships TO authenticated;
