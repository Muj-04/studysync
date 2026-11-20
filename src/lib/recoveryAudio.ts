import type { VoiceNote } from '@/types';
import { createClient } from '@/lib/supabase/client';
interface AudioCopy { ownerId: string; documentId: string; id: string; blob: Blob; title?: string; pageNumber: number | string }
async function database(owner: string): Promise<IDBDatabase> {
  const { data: { user } } = await createClient().auth.getUser();
  if (user?.id !== owner) throw new Error('Account changed before audio recovery');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`studysync_recovery_audio_${encodeURIComponent(owner)}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('audio', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function retainRecoveryAudio(owner: string, note: VoiceNote): Promise<void> {
  if (!note.audioBlob?.size) return;
  const db = await database(owner);
  try { await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('audio', 'readwrite');
    transaction.objectStore('audio').put({ ownerId: owner, documentId: note.documentId, id: note.id, blob: note.audioBlob, title: note.title, pageNumber: note.pageNumber } satisfies AudioCopy);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
  }); } finally { db.close(); }
}
export async function readRecoveryAudio(owner: string, documentId: string): Promise<AudioCopy[]> {
  const db = await database(owner);
  try { return await new Promise<AudioCopy[]>((resolve, reject) => {
    const request = db.transaction('audio', 'readonly').objectStore('audio').getAll();
    request.onsuccess = () => resolve((request.result as AudioCopy[]).filter(entry => entry.ownerId === owner && entry.documentId === documentId));
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
