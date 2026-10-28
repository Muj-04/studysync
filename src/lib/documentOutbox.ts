import { storageGet, storageSet, storageKeys, storageRemove } from '@/lib/storage';

export interface DocumentScope {
  ownerId: string; documentId: string; generation: string; collection: string; pageKey: string;
}
export interface DocumentWrite extends DocumentScope {
  writeId: string; expectedRevision: number | null; rows: unknown[];
  status: 'pending' | 'conflict' | 'blocked'; error?: string; createdAt: number;
}
const prefix = 'studysync_document_outbox_';
const active = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
export const subscribeDocumentOutbox = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => { for (const listener of listeners) listener(); };
function key(owner: string) { return `${prefix}${encodeURIComponent(owner)}:`; }
function scopeKey(scope: DocumentScope) { return JSON.stringify([scope.ownerId, scope.documentId, scope.generation, scope.collection, scope.pageKey]); }
function entryKey(entry: DocumentWrite) { return `${key(entry.ownerId)}write:${entry.writeId}`; }
function baselineKey(scope: DocumentScope) { return `${key(scope.ownerId)}baseline:${scopeKey(scope)}`; }
function cancelledKey(owner: string, doc: string) { return `${key(owner)}cancelled:${encodeURIComponent(doc)}`; }
function persist(key: string, value: unknown) {
  if (!storageSet(key, value)) throw new Error('Recovery storage is unavailable or full. Keep this tab open and export your work.');
  notify();
}
export function observeDocumentCollection(scope: DocumentScope, revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid document revision');
  persist(baselineKey(scope), revision);
}
export function listDocumentWrites(ownerId: string): DocumentWrite[] {
  return storageKeys(`${key(ownerId)}write:`).filter(key => !key.endsWith(':attempt')).map(key => {
    const entry = storageGet<DocumentWrite>(key);
    if (!entry || entry.ownerId !== ownerId || !entry.writeId || !Array.isArray(entry.rows) || !entry.documentId || !entry.generation) {
      throw new Error('Recovery storage contains unreadable work. Keep browser data and export before retrying.');
    }
    return entry;
  }).sort((a, b) => a.createdAt - b.createdAt || a.writeId.localeCompare(b.writeId))
    .map(entry => { const reason = storageGet<string>(cancelledKey(ownerId, entry.documentId)); return reason ? { ...entry, status: 'conflict' as const, error: reason } : entry; });
}
export function nextDocumentWrite(scope: DocumentScope): DocumentWrite | undefined {
  return listDocumentWrites(scope.ownerId).find(entry => scopeKey(entry) === scopeKey(scope));
}
export function stageDocumentWrite(scope: DocumentScope, rows: unknown[]): DocumentWrite {
  if (!scope.ownerId || !scope.documentId || !scope.generation) throw new Error('Document ownership and generation are required');
  const writes = listDocumentWrites(scope.ownerId);
  const predecessor = [...writes].reverse().find(entry => scopeKey(entry) === scopeKey(scope));
  const revision = predecessor ? predecessor.expectedRevision : storageGet<number>(baselineKey(scope)) ?? null;
  const entry: DocumentWrite = {
    ...scope, writeId: crypto.randomUUID(), expectedRevision: revision,
    rows: JSON.parse(JSON.stringify(rows)), createdAt: Math.max(Date.now(), (writes.at(-1)?.createdAt ?? 0) + 1),
    status: storageGet(cancelledKey(scope.ownerId, scope.documentId)) ? 'conflict' : predecessor?.status ?? (revision === null ? 'blocked' : 'pending'),
    ...(revision === null ? { error: 'No observed cloud revision. Export or create a recovery copy.' } : {}),
  };
  persist(entryKey(entry), entry);
  return entry;
}
export function acknowledgeDocumentWrite(entry: DocumentWrite, revision: number): void {
  const writes = listDocumentWrites(entry.ownerId);
  const index = writes.findIndex(write => write.writeId === entry.writeId);
  if (index < 0 || writes[index].status !== 'pending') return;
  if (writes.slice(0, index).some(write => scopeKey(write) === scopeKey(entry))) return;
  // Individual keys prevent two tabs staging unrelated writes from losing one
  // another's payload. Concurrent revision changes still fail server CAS safely.
  for (const successor of writes.slice(index + 1)) {
    if (scopeKey(successor) === scopeKey(entry) && successor.status === 'pending') {
      persist(entryKey(successor), { ...successor, expectedRevision: revision });
    }
  }
  persist(baselineKey(entry), revision);
  if (!storageRemove(entryKey(entry))) throw new Error('Recovery storage acknowledgement failed');
  notify();
}

export function failDocumentWrite(entry: DocumentWrite, error: unknown, terminal = false): void {
  for (const pending of listDocumentWrites(entry.ownerId)) {
    if (pending.writeId === entry.writeId || (terminal && scopeKey(pending) === scopeKey(entry))) {
      pending.error = error instanceof Error ? error.message : String(error);
      if (terminal) pending.status = 'conflict';
      persist(entryKey(pending), pending);
    }
  }
}
export function isDocumentRecoveryOnly(ownerId: string, documentId: string): boolean {
  return storageGet<string>(cancelledKey(ownerId, documentId)) !== null;
}
export function cancelDocumentWrites(ownerId: string, documentId: string, reason: string): void {
  persist(cancelledKey(ownerId, documentId), reason);
}

/** One bounded owner pass. Executors send the frozen entry and return its revision. */
export function retryDocumentWrites(ownerId: string, execute: (entry: DocumentWrite) => Promise<number>, currentOwner: () => Promise<string | null>): Promise<void> {
  const running = active.get(ownerId);
  if (running) return running;
  const run = (async () => {
    const seen = new Set<string>();
    const candidates = listDocumentWrites(ownerId).sort((a, b) =>
      (storageGet<number>(`${entryKey(a)}:attempt`) ?? 0) - (storageGet<number>(`${entryKey(b)}:attempt`) ?? 0));
    let attempts = 0;
    for (const entry of candidates) {
      const scope = scopeKey(entry);
      if (seen.has(scope)) continue;
      seen.add(scope);
      if (entry.status !== 'pending') continue;
      if (nextDocumentWrite(entry)?.writeId !== entry.writeId) continue;
      if (await currentOwner() !== ownerId) return;
      try {
        persist(`${entryKey(entry)}:attempt`, Date.now());
        attempts++;
        const revision = await execute(entry);
        if (await currentOwner() !== ownerId) return;
        acknowledgeDocumentWrite(entry, revision);
      } catch (error) {
        if (await currentOwner() !== ownerId) return;
        const code = (error as { code?: string }).code;
        failDocumentWrite(entry, error, code === 'DOCUMENT_CONFLICT' || code === 'DOCUMENT_DELETED' || code === 'DOCUMENT_GENERATION_MISMATCH');
      }
      if (attempts >= 20) break;
    }
  })().finally(() => { active.delete(ownerId); });
  active.set(ownerId, run);
  return run;
}
