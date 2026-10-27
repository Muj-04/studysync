import { createClient } from '@/lib/supabase/client';

const LEGACY_DB_NAME = 'studysync_pdfs';
const SCOPED_DB_PREFIX = 'studysync_pdfs_user_';
const STORE = 'files';
const DB_VERSION = 1;

export interface StoredPdf { blob: Blob; filename?: string; fingerprint?: string }

function asStoredPdf(value: unknown): StoredPdf | null {
  if (value instanceof Blob) return { blob: value, filename: typeof File !== 'undefined' && value instanceof File ? value.name : undefined };
  if (value && typeof value === 'object' && 'blob' in value && value.blob instanceof Blob) return value as StoredPdf;
  return null;
}

// Avoid repeating the one-time legacy ownership check during the same session.
const migratedLegacyScopes = new Set<string>();

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readEntry(db: IDBDatabase, docId: string): Promise<StoredPdf | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(docId);
    req.onsuccess = () => resolve(asStoredPdf(req.result));
    req.onerror = () => reject(req.error);
  });
}

function writeEntry(db: IDBDatabase, docId: string, entry: StoredPdf): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry, docId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function removeBlob(db: IDBDatabase, docId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(docId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function readAllDocIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result.filter((key): key is string => typeof key === 'string'));
    req.onerror = () => reject(req.error);
  });
}

async function getStorageScope() {
  const client = createClient();
  const { data: { session }, error } = await client.auth.getSession();
  const userId = session?.user.id;

  if (error || !userId) {
    throw new Error('Authenticated user required for local PDF storage');
  }

  return {
    client,
    userId,
    dbName: `${SCOPED_DB_PREFIX}${encodeURIComponent(userId)}`,
  };
}

/**
 * Move legacy, unscoped blobs only after the current user's RLS-protected
 * documents query proves ownership. Unknown blobs remain in the legacy DB and
 * are never exposed through the scoped storage API.
 */
async function migrateOwnedLegacyBlobs(
  scope: Awaited<ReturnType<typeof getStorageScope>>,
  scopedDb: IDBDatabase,
  onlyDocId?: string,
): Promise<void> {
  if (!onlyDocId && migratedLegacyScopes.has(scope.userId)) return;

  let query = scope.client
    .from('documents')
    .select('id')
    .eq('user_id', scope.userId);
  if (onlyDocId) query = query.eq('id', onlyDocId);

  const { data, error } = await query;
  if (error) return; // Offline or unavailable: fail closed and retry later.

  const ownedIds = (data ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string');

  const legacyDb = await openDb(LEGACY_DB_NAME);
  try {
    for (const docId of ownedIds) {
      const legacyBlob = await readEntry(legacyDb, docId);
      if (!legacyBlob) continue;

      const existingScopedBlob = await readEntry(scopedDb, docId);
      if (!existingScopedBlob) await writeEntry(scopedDb, docId, legacyBlob);

      // Copy completed successfully (or the scoped copy already existed), so
      // the unsafe unscoped copy can no longer be exposed by old code.
      await removeBlob(legacyDb, docId);
    }

    if (!onlyDocId) migratedLegacyScopes.add(scope.userId);
  } finally {
    legacyDb.close();
  }
}

export async function savePdfBlob(docId: string, blob: Blob, metadata: Omit<StoredPdf, 'blob'> = {}): Promise<void> {
  const scope = await getStorageScope();
  const db = await openDb(scope.dbName);
  try {
    await writeEntry(db, docId, { blob, ...metadata });
  } finally {
    db.close();
  }
}

export async function getStoredPdf(docId: string): Promise<StoredPdf | null> {
  const scope = await getStorageScope();
  const db = await openDb(scope.dbName);
  try {
    const scopedBlob = await readEntry(db, docId);
    if (scopedBlob) return scopedBlob;

    await migrateOwnedLegacyBlobs(scope, db, docId);
    return readEntry(db, docId);
  } finally {
    db.close();
  }
}

export async function deletePdfBlob(docId: string): Promise<void> {
  const scope = await getStorageScope();
  const db = await openDb(scope.dbName);
  try {
    await removeBlob(db, docId);
  } finally {
    db.close();
  }
}

export async function getAllStoredDocIds(): Promise<string[]> {
  const scope = await getStorageScope();
  const db = await openDb(scope.dbName);
  try {
    await migrateOwnedLegacyBlobs(scope, db);
    return readAllDocIds(db);
  } finally {
    db.close();
  }
}

export async function getPdfBlob(docId: string): Promise<Blob | null> {
  return (await getStoredPdf(docId))?.blob ?? null;
}
