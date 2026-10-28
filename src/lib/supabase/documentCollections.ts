import { createClient } from './client';
import { assertDocumentOwner, knownDocumentGeneration, requireDocumentGeneration, DocumentConflictError } from './documentProtocol';
import { isDocumentRecoveryOnly, acknowledgeDocumentWrite, failDocumentWrite, nextDocumentWrite, observeDocumentCollection, stageDocumentWrite, retryDocumentWrites, type DocumentScope, type DocumentWrite } from '@/lib/documentOutbox';
import { enqueueDocumentWrite } from '@/lib/persistence/documentQueue';

export type DocumentCollection = 'text_notes' | 'bookmarks' | 'key_terms' | 'blank_pages' | 'flashcards' | 'drawings' | 'page_image_annotations' | 'session_state';
const initializedScopes = new Set<string>();
const snapshots = new Map<string, Record<string, number>>();
const snapshotKey = (owner: string, doc: string, generation: string, collection: string) => JSON.stringify([owner, doc, generation, collection]);
export async function documentOwner(expectedOwner?: string): Promise<string> {
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error('Sign in to sync study data');
  if (expectedOwner && user.id !== expectedOwner) throw new Error('The account changed before document synchronization finished.');
  return user.id;
}
/** Rows and revisions come from one server snapshot, never separate race-prone reads. */
export async function readDocumentCollection(collection: DocumentCollection, documentId: string): Promise<Record<string, unknown>[]> {
  const ownerId = await documentOwner();
  const generation = await requireDocumentGeneration(ownerId, documentId);
  const { data, error } = await createClient().rpc('read_document_collection_v2', { p_collection: collection, p_document_id: documentId, p_generation: generation });
  if (error) throw protocolError(error);
  await assertDocumentOwner(ownerId);
  if (!data || !Array.isArray(data.rows) || !data.revisions) throw new Error('The document snapshot is incomplete. Local edits were retained.');
  snapshots.set(snapshotKey(ownerId, documentId, generation, collection), data.revisions);
  for (const [pageKey, revision] of Object.entries(data.revisions)) {
    observeDocumentCollection({ ownerId, documentId, generation, collection, pageKey }, Number(revision));
    initializedScopes.add(JSON.stringify([ownerId, documentId, generation, collection, pageKey]));
  }
  return data.rows;
}
function protocolError(error: { message?: string; code?: string }) {
  if (/^PD[DC]/.test(error.code ?? '') || /DOCUMENT_(DELETED|CONFLICT|GENERATION_MISMATCH)|revision conflict|generation|deleted/i.test(error.message ?? '')) {
    return new DocumentConflictError(error.message ?? 'The cloud document changed. Keep your recovery copy.');
  }
  return Object.assign(new Error(error.message ?? 'Document synchronization failed'), { code: error.code });
}
export async function executeDocumentWrite(entry: DocumentWrite): Promise<number> {
  await assertDocumentOwner(entry.ownerId);
  if (isDocumentRecoveryOnly(entry.ownerId, entry.documentId)) throw new DocumentConflictError('Original document is retained for recovery only. Create a new copy.');
  if (entry.expectedRevision === null) throw new DocumentConflictError('No observed cloud revision. Keep these edits as a recovery copy.');
  const { data, error } = await createClient().rpc('replace_study_collection_v2', {
    p_collection: entry.collection, p_document_id: entry.documentId, p_generation: entry.generation,
    p_page_key: entry.pageKey || null, p_expected_revision: entry.expectedRevision, p_write_id: entry.writeId, p_rows: entry.rows,
  });
  if (error) throw protocolError(error);
  await assertDocumentOwner(entry.ownerId);
  const revision = Number(data);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Missing document write acknowledgement; retry will use the same operation ID.');
  return revision;
}
/** Durable capture happens before queueing; retries preserve identity, payload and baseline. */
export async function writeDocumentCollection(collection: DocumentCollection, documentId: string, rows: unknown[], pageKey: string | null = null, expectedOwner?: string): Promise<void> {
  const ownerId = await documentOwner(expectedOwner);
  const generation = knownDocumentGeneration(ownerId, documentId) ?? 'unknown';
  const scope: DocumentScope = { ownerId, documentId, generation, collection, pageKey: pageKey ?? '' };
  const observed = snapshots.get(snapshotKey(ownerId, documentId, generation, collection));
  const scopeKey = JSON.stringify([ownerId, documentId, generation, collection, scope.pageKey]);
  if (observed && !initializedScopes.has(scopeKey)) {
    observeDocumentCollection(scope, observed[scope.pageKey] ?? 0);
    initializedScopes.add(scopeKey);
  }
  const staged = stageDocumentWrite(scope, rows);
  await enqueueDocumentWrite(documentId, async () => {
    await assertDocumentOwner(ownerId);
    for (;;) {
      const entry = nextDocumentWrite(scope);
      if (!entry) return;
      if (entry.status !== 'pending') throw new DocumentConflictError(entry.error ?? 'Document edits need explicit recovery.');
      try {
        const revision = await executeDocumentWrite(entry);
        acknowledgeDocumentWrite(entry, revision);
        // Advance this tab's snapshot only for acknowledged local writes.
        if (observed) observed[scope.pageKey] = revision;
      } catch (error) {
        failDocumentWrite(entry, error, error instanceof DocumentConflictError);
        throw error;
      }
      if (entry.writeId === staged.writeId) return;
    }
  });
}
export function retryPendingDocumentWrites(ownerId: string): Promise<void> {
  return retryDocumentWrites(ownerId, executeDocumentWrite, async () => {
    const { data: { user } } = await createClient().auth.getUser();
    return user?.id ?? null;
  });
}
