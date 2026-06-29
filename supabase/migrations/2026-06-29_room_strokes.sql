-- Migration: append-only stroke log for collaborative room drawings.
--
-- Why this exists
-- ---------------
-- The original room_drawings table stored each page's drawing layer as a
-- single PNG snapshot (data text) keyed by (room_id, page_number). Saves
-- were `upsert`s of the *entire* canvas bitmap, computed client-side by
-- toDataURL(). That design has a fundamental last-write-wins race when
-- two members draw on the same page:
--
--   1. A draws → A broadcasts a PNG → B starts drawing BEFORE A's PNG
--      arrives. B's local canvas has no A-stroke. B's stopDraw snapshots
--      the canvas (B's stroke only) and that snapshot overwrites the
--      room_drawings row + gets broadcast as authoritative state. A's
--      stroke is gone for everyone.
--   2. A's broadcast lands mid-B-stroke. The receiving useEffect calls
--      ctx.clearRect + drawImage(A's PNG), wiping B's in-progress pixels.
--      B's stopDraw then snapshots a canvas that's lost most of B's work.
--   3. The 500ms saveRoomTimer debounce lets stale snapshots win against
--      a freshly-saved newer snapshot when the older timer fires last.
--
-- Bug A (missing strokes) and Bug B (mutual stroke deletion) are both
-- symptoms of the same root cause: shared bitmap, last write wins.
--
-- The fix is to stop treating "the drawing" as a piece of state. Each
-- stroke becomes an append-only event in this table. The bitmap is a
-- derived view computed by replaying strokes in `seq` order. INSERTs from
-- A and B never collide (different ids), every client converges, and a
-- lost realtime packet is recoverable on reconnect by fetching strokes
-- with seq > maxLocalSeq.
--
-- Schema notes
-- ------------
-- page_key encodes the page identity client-side. Two shapes today:
--   'pdf:<n>'      — PDF page N (1-indexed)
--   'blank:<uuid>' — a room blank page (id is the row's uuid)
-- Storing as text keeps the schema flexible if/when we introduce other
-- page kinds. Replay order is (room_id, page_key, seq).
--
-- stroke is a JSONB blob shaped by the client. Typical fields:
--   { id, tool, penType, color, size, points: [{x,y}, …], compositeMode }
-- Eraser strokes record compositeMode='destination-out' so replay paints
-- them in the same order as everything else — no special casing.
--
-- seq is a bigserial. It's globally monotonic (not dense per-room), but
-- ordering within (room_id, page_key) is what replay needs and bigserial
-- guarantees that.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE POLICY IF NOT EXISTS so
-- the migration is safe to re-run.

CREATE TABLE IF NOT EXISTS public.room_strokes (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid          NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  page_key    text          NOT NULL,
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq         bigserial     NOT NULL,
  stroke      jsonb         NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

-- Replay order per (room, page). Primary read pattern for canvas init.
CREATE INDEX IF NOT EXISTS room_strokes_room_page_seq_idx
  ON public.room_strokes (room_id, page_key, seq);

-- Reconciliation pattern: "give me everything in this room newer than
-- seq X" for catching up after a dropped realtime broadcast.
CREATE INDEX IF NOT EXISTS room_strokes_room_seq_idx
  ON public.room_strokes (room_id, seq);

-- ── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.room_strokes ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the room can read every stroke in that room.
-- Members are listed in room_members; an EXISTS check keeps the policy
-- index-friendly (room_members has a PK on (room_id, user_id) so the
-- lookup is a single index probe).
DROP POLICY IF EXISTS room_strokes_select ON public.room_strokes;
CREATE POLICY room_strokes_select ON public.room_strokes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.room_members rm
       WHERE rm.room_id = room_strokes.room_id
         AND rm.user_id = auth.uid()
    )
  );

-- INSERT: the inserting user must (a) be the stroke's author and (b) be
-- a member of the room. No UPDATE / DELETE policies — strokes are
-- append-only from the client's perspective. (Server-side cleanup, if
-- ever needed, can run as service_role which bypasses RLS.)
DROP POLICY IF EXISTS room_strokes_insert ON public.room_strokes;
CREATE POLICY room_strokes_insert ON public.room_strokes
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.room_members rm
       WHERE rm.room_id = room_strokes.room_id
         AND rm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.room_strokes IS
  'Append-only log of drawing strokes for collaborative rooms. Replaces the per-page PNG snapshots in room_drawings, which had a last-write-wins race under concurrent edits. The page canvas is a derived view: replay strokes for (room_id, page_key) in seq order.';
