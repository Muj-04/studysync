import { serverRecordingRecoveryEnabled } from './serverRecordingAdapter';
import { saveRecording, deleteRecording, recoverRecordings, renameRecording } from './recordingRecovery';
import { enqueueDocumentWrite } from '@/lib/persistence/documentQueue';
import { sb, userId, ensureDoc } from './dbShared';
import type { VoiceNote } from '@/types';

// ── Voice Notes ──────────────────────────────────────────────────────────────

async function saveVoiceNoteNow(note: VoiceNote, uid: string) {
  if (await userId() !== uid) throw new Error('The account changed before recording synchronization finished.');
  await ensureDoc(uid, note.documentId);
  return saveRecording('document', note.documentId, note, uid);
}

export async function fetchVoiceNotes(docId?: string): Promise<Array<{
  id: string; documentId: string; pageNumber: number | string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
}>> {
  const uid = await userId(); if (!uid) { console.warn('[DB] fetchVoiceNotes — no uid'); return []; }
  await recoverRecordings('document', docId);
  if (await userId() !== uid) throw new Error('The account changed while loading recordings.');
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

export async function updateVoiceNoteTitle(noteId: string, title: string | undefined, expectedOwner?: string) {
  if (serverRecordingRecoveryEnabled()) return renameRecording(noteId, title, expectedOwner);
  const uid = await userId(); if (!uid) return;
  await sb().from('voice_notes').update({ title: title ?? null }).eq('id', noteId).eq('user_id', uid);
}

export async function deleteVoiceNote(noteId: string, docId: string, expectedOwner?: string) {
  return deleteRecording('document', docId, noteId, expectedOwner);
}


/** Share the document lifetime with collection writes and deletion. */
export async function saveVoiceNote(note: VoiceNote, expectedOwner?: string): Promise<string> {
  const uid = await userId();
  if (!uid) throw new Error('Sign in to save recordings.');
  if (expectedOwner && uid !== expectedOwner) throw new Error('The account changed before recording synchronization finished.');
  if (serverRecordingRecoveryEnabled()) return saveRecording('document', note.documentId, note, uid);
  return enqueueDocumentWrite(note.documentId, () => saveVoiceNoteNow(note, uid));
}
