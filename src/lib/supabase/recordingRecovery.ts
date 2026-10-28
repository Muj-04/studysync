import { storageGet, storageSet } from '@/lib/storage';
import { createSerialQueue } from '@/lib/persistence/serialQueue';
import { enqueueDocumentWrite } from '@/lib/persistence/documentQueue';
import { sb, userId } from './dbShared';
import type { VoiceNote } from '@/types';

export type RecordingScope = 'room' | 'document';
type RecordEntry = {
  owner: string; scope: RecordingScope; scopeId: string; id: string;
  action: 'save' | 'published' | 'delete' | 'deleted'; path: string;
  page: string; duration: number; timestamp: string; size: number;
  publicationAttempted?: boolean;
  title?: string;
  lastRecoveryAttempt?: number;
};
const enqueue = createSerialQueue();
const keyFor = (uid: string) => `studysync_recording_recovery_${encodeURIComponent(uid)}`;
const idFor = (scope: RecordingScope, scopeId: string, id: string) => JSON.stringify([scope, scopeId, id]);
const tableFor = (scope: RecordingScope) => scope === 'room' ? 'room_voice_notes' : 'voice_notes';
const columnFor = (scope: RecordingScope) => scope === 'room' ? 'room_id' : 'document_id';
function entries(uid: string) { return storageGet<Record<string, RecordEntry>>(keyFor(uid)) ?? {}; }
function put(entry: RecordEntry | null, uid: string, id: string) {
  const current = entries(uid);
  if (entry) current[id] = entry; else delete current[id];
  if (!storageSet(keyFor(uid), current)) throw new Error('Recording recovery storage is unavailable. Please keep this tab open and try again.');
}
async function assertOwner(uid: string) {
  if (await userId() !== uid) throw new Error('The account changed before recording synchronization finished.');
}
async function read(entry: RecordEntry) {
  await assertOwner(entry.owner);
  const { data, error } = await sb().from(tableFor(entry.scope)).select('id, user_id, audio_url')
    .eq('id', entry.id).eq(columnFor(entry.scope), entry.scopeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data && data.user_id !== entry.owner) throw new Error('This recording belongs to another account.');
  return data;
}
async function publish(entry: RecordEntry) {
  const existing = await read(entry);
  if (existing?.audio_url) return existing.audio_url as string;
  // A prior insert may have committed and then been deleted on another device.
  // Neither background recovery nor a repeat save can safely resurrect it.
  // A server tombstone is needed to decide across clients; retain the local audio.
  if (entry.publicationAttempted) throw new Error('The previous recording publication cannot be confirmed. Keep the audio; recovery requires a new recording copy.');
  await assertOwner(entry.owner);
  const { data: signed, error } = await sb().storage.from('voice-notes').createSignedUrl(entry.path, 60 * 60 * 24 * 365 * 10);
  if (error || !signed?.signedUrl) throw new Error(error?.message ?? 'Could not create a playback URL.');
  await assertOwner(entry.owner);
  const row = {
    id: entry.id, user_id: entry.owner, [columnFor(entry.scope)]: entry.scopeId,
    page_number: entry.page, duration: entry.duration, timestamp: entry.timestamp,
    audio_url: signed.signedUrl, title: entry.title ?? null,
    ...(entry.scope === 'document' ? { audio_size_bytes: entry.size } : {}),
  };
  put({ ...entry, publicationAttempted: true }, entry.owner, idFor(entry.scope, entry.scopeId, entry.id));
  let failure: unknown;
  try {
    const result = await sb().from(tableFor(entry.scope)).insert(row);
    if (result.error) {
      failure = new Error(result.error.message);
      // A PostgreSQL statement rejection is definitive, unlike a transport or
      // proxy failure after commit. Permit retry only for the former.
      if (/^[0-9A-Z]{5}$/.test(result.error.code ?? '')) {
        put({ ...entry, publicationAttempted: false }, entry.owner, idFor(entry.scope, entry.scopeId, entry.id));
      }
    }
  } catch (error) { failure = error; }
  // Even a thrown network error can follow a committed insert. Never delete the
  // object to compensate for an ambiguous publication; first read back its row.
  const confirmed = await read(entry);
  if (!confirmed?.audio_url) throw failure ?? new Error('The recording was not saved.');
  return confirmed.audio_url as string;
}

/** Audio is immutable for its note ID. Retry never overwrites a published file. */
export async function saveRecording(scope: RecordingScope, scopeId: string, note: VoiceNote, expectedOwner?: string): Promise<string> {
  const uid = await userId();
  if (!uid) throw new Error('Sign in to save recordings.');
  if (expectedOwner && uid !== expectedOwner) throw new Error('The account changed before recording synchronization finished.');
  if (!note.audioBlob?.size) throw new Error('The recording is empty.');
  const id = idFor(scope, scopeId, note.id);
  return enqueue(`${uid}:${id}`, async () => {
    await assertOwner(uid);
    const previous = entries(uid)[id];
    if (previous && (previous.action === 'delete' || previous.action === 'deleted')) throw new Error('This recording was deleted or is awaiting deletion.');
    const mime = note.audioBlob.type.split(';')[0] || 'audio/webm';
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : 'webm';
    const entry: RecordEntry = previous ?? {
      owner: uid, scope, scopeId, id: note.id, action: 'save',
      path: scope === 'room' ? `rooms/${scopeId}/${note.id}.${ext}` : `${uid}/${scopeId}/${note.id}.${ext}`,
      page: String(note.pageNumber), duration: note.duration, size: note.audioBlob.size,
      title: note.title,
      timestamp: note.timestamp instanceof Date ? note.timestamp.toISOString() : String(note.timestamp),
    };
    const existing = await read(entry);
    if (existing?.audio_url) { put({ ...entry, title: undefined, action: 'published' }, uid, id); return existing.audio_url as string; }
    if (previous?.action === 'published') throw new Error('This published recording was deleted remotely.');
    if (previous?.publicationAttempted) throw new Error('The previous recording publication cannot be confirmed. Keep the audio; recovery requires a new recording copy.');
    put(entry, uid, id); // Durable intent precedes every possibly successful upload.
    await assertOwner(uid);
    const { error } = await sb().storage.from('voice-notes').upload(entry.path, note.audioBlob, { upsert: false, contentType: mime });
    // A retry of a committed upload gets 409. Signing/readback then determine
    // whether it can be published, without replacing or rolling back its bytes.
    if (error && String((error as { statusCode?: string }).statusCode) !== '409') throw new Error(error.message);
    const url = await publish(entry);
    put({ ...entry, title: undefined, action: 'published' }, uid, id);
    return url;
  });
}

async function finishDelete(entry: RecordEntry) {
  const existing = await read(entry);
  if (existing) {
    await assertOwner(entry.owner);
    let failure: unknown;
    try {
      const { error } = await sb().from(tableFor(entry.scope)).delete()
        .eq('id', entry.id).eq(columnFor(entry.scope), entry.scopeId).eq('user_id', entry.owner);
      if (error) failure = new Error(error.message);
    } catch (error) { failure = error; }
    // RLS can turn a delete into zero rows; a lost response can mean success.
    if (await read(entry)) throw failure ?? new Error('This recording could not be deleted.');
  }
  await assertOwner(entry.owner);
  const stem = entry.scope === 'room' ? `rooms/${entry.scopeId}/${entry.id}` : `${entry.owner}/${entry.scopeId}/${entry.id}`;
  const { error } = await sb().storage.from('voice-notes').remove(['webm','ogg','mp4'].map(ext => `${stem}.${ext}`));
  if (error) throw new Error(error.message);
  await assertOwner(entry.owner);
  put({ ...entry, title: undefined, action: 'deleted' }, entry.owner, idFor(entry.scope, entry.scopeId, entry.id));
}

export async function deleteRecording(scope: RecordingScope, scopeId: string, noteId: string, expectedOwner?: string): Promise<void> {
  const uid = await userId();
  if (!uid) throw new Error('Sign in to delete recordings.');
  if (expectedOwner && uid !== expectedOwner) throw new Error('The account changed before recording synchronization finished.');
  const id = idFor(scope, scopeId, noteId);
  return enqueue(`${uid}:${id}`, async () => {
    await assertOwner(uid);
    const previous = entries(uid)[id];
    if (previous?.action === 'deleted') return;
    const entry: RecordEntry = { ...(previous ?? {
      owner: uid, scope, scopeId, id: noteId, path: '', page: '', duration: 0, timestamp: '', size: 0,
    }), action: 'delete' };
    // Check ownership before journaling or deleting room objects shared by peers.
    const existing = await read(entry);
    if (!existing && !previous) {
      put({ ...entry, action: 'deleted' }, uid, id);
      return;
    }
    put(entry, uid, id);
    await finishDelete(entry);
  });
}

/** Retry tracked work only for the signed-in owner and requested scope. */
export async function recoverRecordings(scope: RecordingScope, scopeId?: string): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  const pending = Object.values(entries(uid)).filter(entry => entry.owner === uid && entry.scope === scope
    && (!scopeId || entry.scopeId === scopeId) && (entry.action === 'save' || entry.action === 'delete'))
    .sort((a, b) => (a.lastRecoveryAttempt ?? 0) - (b.lastRecoveryAttempt ?? 0)).slice(0, 20);
  for (const entry of pending) {
    try {
      const id = idFor(entry.scope, entry.scopeId, entry.id);
      // Age even work blocked by a deleted parent so it cannot monopolize every
      // bounded pass. Keep this synchronous read/write together before queuing.
      await assertOwner(uid);
      const scheduled = entries(uid)[id];
      if (!scheduled || scheduled.action === 'published' || scheduled.action === 'deleted') continue;
      put({ ...scheduled, lastRecoveryAttempt: Date.now() }, uid, id);
      const recover = () => enqueue(`${uid}:${id}`, async () => {
        await assertOwner(uid);
        const latest = entries(uid)[id];
        if (!latest || latest.action === 'deleted' || latest.action === 'published') return;
        const attempt = { ...latest, lastRecoveryAttempt: Date.now() };
        put(attempt, uid, id);
        if (attempt.action === 'delete') await finishDelete(attempt);
        else { await publish(attempt); put({ ...attempt, title: undefined, action: 'published' }, uid, id); }
      });
      // Deletion cleanup must still run after the parent deletion barrier closed;
      // it cannot create a parent/row. Only publication is a document write.
      await (scope === 'document' && scheduled.action === 'save' ? enqueueDocumentWrite(entry.scopeId, recover) : recover());
    } catch (error) { console.warn('[Recordings] recovery remains pending:', error); }
  }
}

export function pendingRecordingIds(uid: string, scope: RecordingScope, scopeId: string): string[] {
  return Object.values(entries(uid)).filter(entry => entry.owner === uid && entry.scope === scope
    && entry.scopeId === scopeId && entry.action !== 'deleted').map(entry => entry.id);
}
