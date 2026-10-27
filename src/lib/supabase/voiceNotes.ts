import { enqueueDocumentWrite } from '@/lib/persistence/documentQueue';
import { sb, userId, ensureDoc } from './dbShared';
import type { VoiceNote } from '@/types';

// ── Voice Notes ──────────────────────────────────────────────────────────────

async function saveVoiceNoteNow(note: VoiceNote) {
  const uid = await userId(); if (!uid) { console.error('[DB] saveVoiceNote — no uid, aborting'); return null; }
  console.log('[DB] saveVoiceNote start — id:', note.id, 'blob size:', note.audioBlob?.size ?? 0, 'blob mime:', note.audioBlob?.type ?? 'none');
  await ensureDoc(uid, note.documentId);

  let audioUrl: string | null = null;

  if (note.audioBlob && note.audioBlob.size > 0) {
    // Strip codecs parameter (e.g. "audio/webm;codecs=opus" → "audio/webm") so
    // the upload content-type matches the bucket's allowed_mime_types exactly.
    const mimeType = note.audioBlob.type.split(';')[0] || 'audio/webm';
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const path = `${uid}/${note.documentId}/${note.id}.${ext}`;
    console.log('[DB] saveVoiceNote uploading — path:', path, 'mimeType:', mimeType, 'size:', note.audioBlob.size);

    const { data: uploadData, error: uploadError } = await sb().storage
      .from('voice-notes')
      .upload(path, note.audioBlob, { upsert: true, contentType: mimeType });

    if (uploadError) {
      console.error('[DB] saveVoiceNote upload FAILED:', uploadError.message, '| statusCode:', (uploadError as { statusCode?: string }).statusCode, '| path:', path);
    } else {
      console.log('[DB] saveVoiceNote upload OK — path:', uploadData?.path ?? path);
      // Bucket is private — getPublicUrl always returns a string (it's URL construction
      // only, no auth check), so that URL would 403. Always use signed URL instead.
      const { data: signed, error: signError } = await sb().storage
        .from('voice-notes')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10-year TTL
      if (signError) {
        console.error('[DB] saveVoiceNote createSignedUrl FAILED:', signError.message);
      } else {
        audioUrl = signed?.signedUrl ?? null;
        console.log('[DB] saveVoiceNote signed URL:', audioUrl ? audioUrl.slice(0, 100) + '…' : 'NULL');
      }
    }
  } else {
    console.warn('[DB] saveVoiceNote — blob is empty or missing, skipping upload');
  }

  const { error: dbError } = await sb().from('voice_notes').upsert({
    id: note.id,
    user_id: uid,
    document_id: note.documentId,
    page_number: String(note.pageNumber),
    duration: note.duration,
    title: note.title ?? null,
    audio_url: audioUrl,
    audio_size_bytes: note.audioBlob?.size ?? 0,
    timestamp: note.timestamp instanceof Date ? note.timestamp.toISOString() : note.timestamp,
  }, { onConflict: 'id' });

  if (dbError) console.error('[DB] saveVoiceNote DB upsert FAILED:', dbError.message, '| code:', dbError.code);
  else console.log('[DB] saveVoiceNote DB upsert OK — id:', note.id, 'audio_url stored:', audioUrl ? 'yes' : 'NO (null)');
  return dbError ? null : audioUrl;
}

export async function fetchVoiceNotes(docId?: string): Promise<Array<{
  id: string; documentId: string; pageNumber: number | string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
}>> {
  const uid = await userId(); if (!uid) { console.warn('[DB] fetchVoiceNotes — no uid'); return []; }
  let q = sb().from('voice_notes').select('*').eq('user_id', uid);
  if (docId) q = q.eq('document_id', docId);
  const { data, error } = await q.order('timestamp', { ascending: false });
  console.log('[DB] fetchVoiceNotes rows:', data?.length ?? 0, 'docId filter:', docId ?? 'none', 'error:', error?.message ?? null);
  if (data) {
    data.forEach((r, i) => {
      console.log(`[DB] fetchVoiceNotes [${i}] id:${r.id} doc:${r.document_id} page:${r.page_number} audio_url:${r.audio_url ? r.audio_url.slice(0, 80) + '…' : 'NULL'}`);
    });
  }
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id,
    // page_number is stored as text; parse to number so it matches the numeric
    // pageIdentifier used locally (strict equality: '5' !== 5 would hide all notes)
    pageNumber: isNaN(Number(r.page_number)) ? r.page_number : Number(r.page_number),
    duration: r.duration, title: r.title, audioUrl: r.audio_url, timestamp: r.timestamp,
  }));
}

export async function updateVoiceNoteTitle(noteId: string, title: string | undefined) {
  const uid = await userId(); if (!uid) return;
  await sb().from('voice_notes').update({ title: title ?? null }).eq('id', noteId).eq('user_id', uid);
}

export async function deleteVoiceNote(noteId: string, docId: string) {
  const uid = await userId(); if (!uid) return;
  const ext = ['webm', 'ogg', 'mp4'];
  for (const e of ext) {
    await sb().storage.from('voice-notes').remove([`${uid}/${docId}/${noteId}.${e}`]);
  }
  await sb().from('voice_notes').delete().eq('id', noteId);
}


/** Share the document lifetime with collection writes and deletion. */
export function saveVoiceNote(...args: Parameters<typeof saveVoiceNoteNow>): ReturnType<typeof saveVoiceNoteNow> {
  return enqueueDocumentWrite(args[0].documentId, () => saveVoiceNoteNow(...args));
}
