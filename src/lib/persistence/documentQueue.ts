import { createSerialQueue } from './serialQueue';

const enqueue = createSerialQueue();
const deleted = new Set<string>();
const deletionGeneration = new Map<string, number>();

/** All collection writes share the parent's lifetime, including queued writes. */
export function enqueueDocumentWrite<T>(docId: string, operation: () => Promise<T>): Promise<T> {
  if (deleted.has(docId)) return Promise.reject(new Error('Document is deleted or deleting'));
  return enqueue(docId, () => {
    if (deleted.has(docId)) throw new Error('Document is deleted or deleting');
    return operation();
  });
}

export function enqueueDocumentDeletion<T>(docId: string, operation: () => Promise<T>): Promise<T> {
  // Cancel pending writes immediately, then wait for the active write to finish.
  deleted.add(docId);
  deletionGeneration.set(docId, (deletionGeneration.get(docId) ?? 0) + 1);
  return enqueue(docId, operation);
}

/** Only an explicit reopen can start a new lifetime for a deleted document. */
export function enqueueDocumentRegistration<T>(docId: string, operation: () => Promise<T>): Promise<T> {
  const generation = deletionGeneration.get(docId) ?? 0;
  return enqueue(docId, async () => {
    const result = await operation();
    // An older registration must not undo a subsequently requested deletion.
    if (generation === (deletionGeneration.get(docId) ?? 0)) deleted.delete(docId);
    return result;
  });
}
