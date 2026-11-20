import { preserveDocumentBeforeRemoval } from '@/lib/documentRecovery';
import { createClient } from './client';

/** Identity is persisted independently of caches so retries never acquire a new lifetime. */
const PREFIX = 'studysync_document_generation_';
export class DocumentConflictError extends Error {
  readonly code = 'DOCUMENT_CONFLICT';
  constructor(message: string) { super(message); this.name = 'DocumentConflictError'; }
}
function key(ownerId: string, documentId: string) {
  return PREFIX + encodeURIComponent(ownerId) + '_' + encodeURIComponent(documentId);
}
export function knownDocumentGeneration(ownerId: string, documentId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key(ownerId, documentId));
}
function remember(ownerId: string, documentId: string, generation: string) {
  const previous = knownDocumentGeneration(ownerId, documentId);
  if (previous && previous !== generation) throw new DocumentConflictError('Document generation changed. Keep your edits as a recovery copy.');
  // A durable identity is mandatory before a write; unavailable storage fails closed.
  localStorage.setItem(key(ownerId, documentId), generation);
}
export async function assertDocumentOwner(ownerId: string): Promise<void> {
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || user?.id !== ownerId) throw new Error('The account changed before document synchronization finished.');
}
async function remoteDocument(ownerId: string, documentId: string) {
  await assertDocumentOwner(ownerId);
  const client = createClient();
  const { data, error } = await client.from('documents').select('id,user_id,generation').eq('id', documentId).eq('user_id', ownerId).maybeSingle();
  if (error) throw error;
  await assertDocumentOwner(ownerId);
  if (data) {
    if (!data.generation || data.user_id !== ownerId) throw new DocumentConflictError('Document protocol is unavailable. Keep the local copy until the application and migration are aligned.');
    remember(ownerId, documentId, data.generation);
    return data.generation as string;
  }
  const { data: tombstone, error: tombstoneError } = await client.from('document_tombstones').select('document_id').eq('document_id', documentId).eq('user_id', ownerId).maybeSingle();
  if (tombstoneError) throw tombstoneError;
  await assertDocumentOwner(ownerId);
  if (tombstone) {
    // Older clients may have pending edits only in their cache/legacy markers.
    // Make those exportable before marking this identity recovery-only.
    preserveDocumentBeforeRemoval(ownerId, documentId, documentId);
    throw new DocumentConflictError('This document was deleted. Your unsynced edits require an explicit recovery copy.');
  }
  return null;
}

/** An annotation write may validate a parent, but never create one implicitly. */
export async function requireDocumentGeneration(ownerId: string, documentId: string): Promise<string> {
  const generation = await remoteDocument(ownerId, documentId);
  if (!generation) throw new DocumentConflictError('The document is missing or has not been registered. Keep your local edits.');
  return generation;
}

/** Only explicit document opening/recovery registers a new identity. Tombstones win in SQL. */
export async function registerDocument(ownerId: string, doc: { id: string; name: string; type: string; pageCount?: number }): Promise<string> {
  const existing = await remoteDocument(ownerId, doc.id);
  if (existing) return existing;
  const generation = knownDocumentGeneration(ownerId, doc.id) ?? crypto.randomUUID();
  remember(ownerId, doc.id, generation);
  await assertDocumentOwner(ownerId);
  const { error } = await createClient().from('documents').insert({
    id: doc.id, user_id: ownerId, generation, name: doc.name, type: doc.type,
    page_count: doc.pageCount ?? null, updated_at: new Date().toISOString(),
  });
  if (error) {
    // A concurrent registration/lost response is accepted only after identity readback.
    if (error.code === '23505') {
      const confirmed = await remoteDocument(ownerId, doc.id);
      if (confirmed === generation) return generation;
    }
    throw error;
  }
  await assertDocumentOwner(ownerId);
  return generation;
}
