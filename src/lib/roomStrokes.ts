import type { RoomStrokePayload } from '@/lib/supabase/db';

/** Upgrade optimistic strokes with server sequence numbers and converge on one order. */
export function mergeRoomStroke(strokes: RoomStrokePayload[], incoming: RoomStrokePayload) {
  const existing = strokes.find((stroke) => stroke.id === incoming.id);
  if (existing && (incoming.seq === undefined || existing.seq === incoming.seq)) return strokes;
  const merged = existing ? strokes.map((stroke) => stroke.id === incoming.id ? incoming : stroke) : [...strokes, incoming];
  return merged.sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity) || a.id.localeCompare(b.id));
}
