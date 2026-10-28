import { KEYS, storageGet, storageSet, storageKeys } from '@/lib/storage';
import { listDocumentWrites, cancelDocumentWrites } from '@/lib/documentOutbox';

export interface LocalDocumentRecovery { ownerId: string; documentId: string; name: string; updatedAt: number; snapshots: Record<string, unknown>; alternatives: Snapshot[] }
interface Snapshot { ownerId: string; documentId: string; kind: string; value: unknown; name?: string; updatedAt: number }
const prefix = 'studysync_document_recovery_';
const tab = crypto.randomUUID();
const memory = new Map<string, Snapshot>();
const listeners = new Set<() => void>();
export const subscribeDocumentRecovery = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const recoveryKey = (owner: string) => `${prefix}${encodeURIComponent(owner)}:`;
export function listLocalDocumentRecovery(ownerId: string): LocalDocumentRecovery[] {
  const snapshots = new Map<string, Snapshot>();
  for (const key of storageKeys(recoveryKey(ownerId))) {
    const value = storageGet<Snapshot>(key);
    if (!value || value.ownerId !== ownerId || !value.documentId || !value.kind) throw new Error('Local recovery data is unreadable. Preserve browser data before retrying.');
    snapshots.set(key, value);
  }
  for (const [key, value] of memory) if (value.ownerId === ownerId) snapshots.set(key, value);
  const entries = new Map<string, LocalDocumentRecovery>();
  for (const value of [...snapshots.values()].sort((a, b) => a.updatedAt - b.updatedAt)) {
    let entry = entries.get(value.documentId);
    if (!entry) { entry = { ownerId, documentId: value.documentId, name: value.name ?? 'Recovered document', updatedAt: value.updatedAt, snapshots: {}, alternatives: [] }; entries.set(value.documentId, entry); }
    entry.snapshots[value.kind] = value.value;
    entry.alternatives.push(value);
    entry.updatedAt = value.updatedAt;
    if (value.name) entry.name = value.name;
  }
  return [...entries.values()];
}
/** Each tab owns its keys; another tab cannot erase retained sibling snapshots. */
export function retainDocumentSnapshot(ownerId: string | null, documentId: string, kind: string, value: unknown, name?: string, captureId = tab): void {
  if (!ownerId) return;
  const key = `${recoveryKey(ownerId)}${encodeURIComponent(documentId)}:${encodeURIComponent(kind)}:${captureId}`;
  const snapshot = { ownerId, documentId, kind, value: JSON.parse(JSON.stringify(value)), name, updatedAt: Date.now() };
  memory.set(key, snapshot);
  const saved = storageSet(key, snapshot);
  for (const listener of listeners) listener();
  if (!saved) {
    if (typeof alert === 'function') alert('Recovery storage is full. Keep this tab open and export your work.');
    throw new Error('Recovery storage is full. Export your work before closing this tab.');
  }
}
export function preserveDocumentBeforeRemoval(ownerId: string, documentId: string, name: string): void {
  const retained = listLocalDocumentRecovery(ownerId).find(entry => entry.documentId === documentId)?.alternatives ?? [];
  const capture = (kind: string, value: unknown) => {
    // Missing caches after logout are not acknowledged user edits. Repeated
    // detection must not replace a previous archive with an empty snapshot.
    if (value == null || (typeof value === 'object' && Object.keys(value).length === 0)) return;
    const serialized = JSON.stringify(value);
    if (retained.some(entry => entry.kind === kind && JSON.stringify(entry.value) === serialized)) return;
    retainDocumentSnapshot(ownerId, documentId, kind, value, name, crypto.randomUUID());
  };
  const byPage = [KEYS.DRAWINGS, KEYS.TEXT_NOTES];
  for (const key of byPage) {
    const stored = storageGet<Record<string, unknown>>(key) ?? {};
    capture(key, Object.fromEntries(Object.entries(stored).filter(([page]) => page.startsWith(`${documentId}:`))));
  }
  for (const key of [KEYS.BLANK_PAGES, KEYS.VOICE_NOTES]) {
    capture(key, (storageGet<Array<{ documentId: string; audioDataUrl?: unknown; audioUrl?: unknown; audioBlob?: unknown }>>(key) ?? []).filter(item => item.documentId === documentId).map(item => { if (key !== KEYS.VOICE_NOTES) return item; const { audioUrl, audioBlob, ...metadata } = item; void audioUrl; void audioBlob; return metadata; }));
  }
  for (const key of [KEYS.PAGE_IMAGES, KEYS.KEY_TERMS, KEYS.BOOKMARKS]) {
    capture(key, storageGet<Record<string, unknown>>(key)?.[documentId] ?? null);
  }
  cancelDocumentWrites(ownerId, documentId, 'Original document removed. Export or create a new recovery copy.');
}
export function recoveryDocumentIds(ownerId: string): string[] {
  return [...new Set([...listLocalDocumentRecovery(ownerId).map(entry => entry.documentId), ...listDocumentWrites(ownerId).map(entry => entry.documentId)])];
}
