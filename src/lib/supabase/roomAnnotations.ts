import { sb, userId } from './dbShared';
import type { VoiceNote } from '@/types';

// ── Room Voice Notes ─────────────────────────────────────────────────────────

export async function saveRoomVoiceNote(roomId: string, note: VoiceNote): Promise<string | null> {
  const uid = await userId();
  if (!uid) throw new Error('Sign in to save room voice notes.');
  if (!note.audioBlob?.size) throw new Error('The recording is empty.');

  const mimeType = note.audioBlob.type.split(';')[0] || 'audio/webm';
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
  const path = `rooms/${roomId}/${note.id}.${ext}`;
  const { error: uploadError } = await sb().storage
    .from('voice-notes')
    .upload(path, note.audioBlob, { upsert: true, contentType: mimeType });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signed, error: signingError } = await sb().storage
    .from('voice-notes')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signingError || !signed?.signedUrl) {
    throw new Error(signingError?.message ?? 'Could not create a playback URL.');
  }
  const audioUrl = signed.signedUrl;

  const { error } = await sb().from('room_voice_notes').upsert({
    id: note.id,
    room_id: roomId,
    user_id: uid,
    page_number: String(note.pageNumber),
    duration: note.duration,
    title: note.title ?? null,
    audio_url: audioUrl,
    timestamp: note.timestamp instanceof Date ? note.timestamp.toISOString() : note.timestamp,
  }, { onConflict: 'id' });

  if (error) throw new Error(error.message);
  return audioUrl;
}

export async function fetchRoomVoiceNotes(roomId: string): Promise<Array<{
  id: string; pageNumber: number | string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
}>> {
  const { data, error } = await sb()
    .from('room_voice_notes')
    .select('id, page_number, duration, title, audio_url, timestamp')
    .eq('room_id', roomId)
    .order('timestamp', { ascending: false });
  if (error) { console.error('[DB] fetchRoomVoiceNotes error:', error.message); return []; }
  return (data ?? []).map((r) => ({
    id: r.id,
    pageNumber: isNaN(Number(r.page_number)) ? r.page_number : Number(r.page_number),
    duration: r.duration,
    title: r.title ?? undefined,
    audioUrl: r.audio_url ?? undefined,
    timestamp: r.timestamp,
  }));
}

export async function fetchSingleRoomVoiceNote(noteId: string, roomId: string): Promise<{
  id: string; pageNumber: number | string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
} | null> {
  const { data, error } = await sb()
    .from('room_voice_notes')
    .select('id, page_number, duration, title, audio_url, timestamp')
    .eq('id', noteId)
    .eq('room_id', roomId)
    .maybeSingle();
  if (error || !data) { console.error('[DB] fetchSingleRoomVoiceNote error:', error?.message); return null; }
  return {
    id: data.id,
    pageNumber: isNaN(Number(data.page_number)) ? data.page_number : Number(data.page_number),
    duration: data.duration,
    title: data.title ?? undefined,
    audioUrl: data.audio_url ?? undefined,
    timestamp: data.timestamp,
  };
}

export async function saveRoomBlankPage(
  roomId: string,
  page: { id: string; insertAfterPage: number; bgTheme: 'white' | 'dark'; createdAt: number },
): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb().from('room_blank_pages').upsert({
    id: page.id,
    room_id: roomId,
    insert_after_page: page.insertAfterPage,
    bg_theme: page.bgTheme,
    created_at: page.createdAt,
    created_by: uid,
  }, { onConflict: 'id' });
  if (error) console.error('[DB] saveRoomBlankPage error:', error.message);
}

export async function fetchRoomBlankPages(
  roomId: string,
): Promise<Array<{ id: string; insertAfterPage: number; bgTheme: 'white' | 'dark'; createdAt: number }>> {
  const { data, error } = await sb()
    .from('room_blank_pages')
    .select('id, insert_after_page, bg_theme, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[DB] fetchRoomBlankPages error:', error.message); return []; }
  return (data ?? []).map((r) => ({
    id: r.id,
    insertAfterPage: r.insert_after_page as number,
    bgTheme: (r.bg_theme === 'dark' ? 'dark' : 'white') as 'white' | 'dark',
    createdAt: r.created_at as number,
  }));
}

export async function deleteRoomVoiceNote(noteId: string, roomId: string): Promise<void> {
  for (const ext of ['webm', 'ogg', 'mp4']) {
    const { error } = await sb().storage.from('voice-notes').remove([`rooms/${roomId}/${noteId}.${ext}`]);
    if (error) throw new Error(error.message);
  }
  const { error } = await sb().from('room_voice_notes').delete().eq('id', noteId);
  if (error) throw new Error(error.message);
}

export async function updateRoomVoiceNoteTitle(noteId: string, title: string | undefined): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('room_voice_notes').update({ title: title ?? null }).eq('id', noteId).eq('user_id', uid);
}

export async function saveRoomDrawing(roomId: string, pageNumber: number, data: string): Promise<void> {
  const { error } = await sb().from('room_drawings').upsert(
    { room_id: roomId, page_number: pageNumber, data, updated_at: new Date().toISOString() },
    { onConflict: 'room_id,page_number' },
  );
  if (error) console.error('[DB] saveRoomDrawing error:', error.message);
}

export async function fetchRoomDrawing(roomId: string, pageNumber: number): Promise<string | null> {
  const { data, error } = await sb()
    .from('room_drawings')
    .select('data')
    .eq('room_id', roomId)
    .eq('page_number', pageNumber)
    .maybeSingle();
  if (error) { console.error('[DB] fetchRoomDrawing error:', error.message); return null; }
  return data?.data ?? null;
}

export async function fetchAllRoomDrawings(roomId: string): Promise<Array<{ pageNumber: number; data: string }>> {
  const { data, error } = await sb()
    .from('room_drawings')
    .select('page_number, data')
    .eq('room_id', roomId);
  if (error) { console.error('[DB] fetchAllRoomDrawings error:', error.message); return []; }
  return (data ?? []).map((row) => ({ pageNumber: row.page_number as number, data: row.data as string }));
}

// ── Room strokes (append-only stroke log) ────────────────────────────────────
//
// Replaces the room_drawings PNG-snapshot model. Every completed stroke is
// one row in room_strokes; the canvas is a derived view computed by replaying
// strokes in `seq` order. Bugs A and B both stem from the old snapshot model
// — see supabase/migrations/2026-06-29_room_strokes.sql for the full why.
//
// The `stroke` JSON is shaped by the client and replayed verbatim on every
// canvas — keep it small (no bitmaps, just a points list).

export interface RoomStrokePayload {
  /** Server-assigned ordering; absent only while a local stroke is pending. */
  seq?: number;
  id:             string;
  tool:           'pen' | 'eraser' | 'line';
  penType:        'normal' | 'marker' | 'highlighter';
  color:          string;
  size:           number;
  points:         Array<{ x: number; y: number }>;
  /** 'destination-out' for eraser; 'source-over' (or omitted) for paint. */
  compositeMode?: 'source-over' | 'destination-out';
  /** Logical canvas dimensions at draw time. Used to scale point
   *  coordinates when replaying on a viewer with different zoom/DPR. */
  canvasW:        number;
  canvasH:        number;
}

export interface RoomStrokeRow {
  id:        string;
  pageKey:   string;
  userId:    string;
  seq:       number;
  stroke:    RoomStrokePayload;
  createdAt: string;
}

/**
 * Fetch every stroke for a room, ordered by seq (replay order).
 * Pass `sinceSeq` to fetch only strokes newer than a known seq —
 * the reconnect reconciliation path uses this to catch up after
 * a dropped realtime broadcast.
 */
export async function fetchAllRoomStrokes(roomId: string, sinceSeq?: number): Promise<RoomStrokeRow[]> {
  const rows: RoomStrokeRow[] = [];
  let cursor = sinceSeq ?? 0;
  while (true) {
    const { data, error } = await sb().from('room_strokes')
      .select('id,page_key,user_id,seq,stroke,created_at').eq('room_id', roomId)
      .gt('seq', cursor).order('seq', { ascending: true }).limit(500);
    if (error) throw new Error(`Could not load room strokes: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) rows.push({
      id: row.id, pageKey: row.page_key, userId: row.user_id, seq: Number(row.seq),
      stroke: { ...row.stroke, seq: Number(row.seq) }, createdAt: row.created_at,
    });
    const next = rows[rows.length - 1].seq;
    if (next <= cursor) throw new Error('Room stroke cursor did not advance');
    cursor = next;
  }
  return rows;
}

/**
 * Append one stroke to the room. The stroke's own id is the client-generated
 * uuid in the payload — recipients dedupe by it (same stroke can arrive via
 * realtime broadcast and via reconciliation; both routes should be idempotent).
 * Returns the assigned `seq` so the caller can advance its maxLocalSeq.
 */
export async function insertRoomStroke(
  roomId: string, pageKey: string, stroke: RoomStrokePayload,
): Promise<{ seq: number } | null> {
  // VERBOSE logging until the persistence bug is diagnosed. The previous
  // implementation logged only error.message which hides RLS-vs-network
  // distinction; here we dump the whole object plus the auth uid + payload
  // shape so the next failing run surfaces the actual cause.
  console.log('[DB] insertRoomStroke ENTRY', {
    roomId, pageKey, strokeId: stroke.id, tool: stroke.tool, points: stroke.points?.length,
  });
  // Session-state probe — pulls a fresh client (the same one we'll INSERT
  // through) and dumps its session. If hasSession is false here on a user
  // whose strokes don't persist, the client lost its JWT (most likely
  // Tracking Prevention blocking storage between page loads, or token
  // refresh silently failing). expiresInSec < 0 means the JWT in memory
  // is past its TTL — autoRefreshToken should have rotated it; if it
  // didn't, refresh itself is broken.
  const client = sb();
  const { data: sess } = await client.auth.getSession();
  console.log('[DB] insertRoomStroke session probe', {
    hasSession:   !!sess.session,
    userId:       sess.session?.user?.id ?? null,
    expiresAt:    sess.session?.expires_at ?? null,
    expiresInSec: sess.session?.expires_at ? (sess.session.expires_at - Math.floor(Date.now() / 1000)) : null,
    strokeId:     stroke.id,
  });
  const uid = sess.session?.user?.id ?? null;
  if (!uid) {
    console.error('[DB] insertRoomStroke ABORT — session.user is null (Tracking Prevention blocked storage? token refresh failed?)', {
      roomId, strokeId: stroke.id,
    });
    return null;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await client
      .from('room_strokes')
      .insert({
        id:        stroke.id,
        room_id:   roomId,
        page_key:  pageKey,
        user_id:   uid,
        stroke,
      })
      .select('seq')
      .single();
    if (!error) {
      console.log('[DB] insertRoomStroke OK', { strokeId: stroke.id, seq: data.seq });
      return { seq: Number(data.seq) };
    }

    const code = (error as { code?: string }).code;
    if (code === '23505') {
      const { data: existing } = await client
        .from('room_strokes')
        .select('seq')
        .eq('id', stroke.id)
        .maybeSingle();
      if (existing) return { seq: Number(existing.seq) };
    }

    console.error('[DB] insertRoomStroke ERROR', {
      attempt: attempt + 1,
      message: error.message,
      code,
      details: (error as { details?: string }).details,
      hint:    (error as { hint?: string }).hint,
      uid, roomId, pageKey, strokeId: stroke.id,
    });
    if (code === '42501' || code === '23503' || code === '23502' || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
  }
  return null;
}

