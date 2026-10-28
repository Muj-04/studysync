import { retainDocumentSnapshot } from '@/lib/documentRecovery';
import { useClientReady } from './useClientReady';
import { useState, useCallback, useEffect, useRef } from 'react';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { saveDrawing as dbSaveDrawing, deleteAllDrawings as dbDeleteAllDrawings } from '@/lib/supabase/db';

export function usePDFDrawings(expectedOwner?: string | null) {
  const [drawings, setDrawings] = useState<Record<string, string>>({});
  const userIdRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const pendingKeys = useRef(new Set<string>());
  const editedKeys = useRef(new Set<string>());
  const versions = useRef(new Map<string, number>());
  const pendingStorageKey = `${KEYS.DRAWINGS}_pending`;

  const markPending = useCallback((keys: string[]) => {
    const ownerAtEdit = expectedOwner ?? userIdRef.current;
    const edits = keys.map((key) => {
      const version = (versions.current.get(key) ?? 0) + 1;
      versions.current.set(key, version);
      pendingKeys.current.add(key);
      editedKeys.current.add(key);
      return { key, version };
    });
    storageSet(pendingStorageKey, [...pendingKeys.current]);
    return () => {
      // A previous workspace must not acknowledge edits from a later mount/account.
      if (!mounted.current || (expectedOwner !== undefined && userIdRef.current !== ownerAtEdit) || storageGet(pendingStorageKey) === null) return;
      for (const { key, version } of edits) {
        if (versions.current.get(key) === version) pendingKeys.current.delete(key);
      }
      storageSet(pendingStorageKey, [...pendingKeys.current]);
    };
  }, [pendingStorageKey, expectedOwner]);

  const previousOwner = useRef(expectedOwner);
  useEffect(() => {
    if (previousOwner.current && previousOwner.current !== expectedOwner) {
      pendingKeys.current.clear(); editedKeys.current.clear(); versions.current.clear(); userIdRef.current = expectedOwner ?? null;
      // An account transition clears the visible cache; owner recovery remains separate.
      setDrawings({});
    }
    previousOwner.current = expectedOwner;
  }, [expectedOwner]);

  const clientReady = useClientReady();
  const [restored, setRestored] = useState(false);
  if (clientReady && !restored) {
    setRestored(true);
    const stored = storageGet<Record<string, string>>(KEYS.DRAWINGS);
    if (stored && Object.keys(stored).length > 0) setDrawings(stored);
  }

  useEffect(() => {
    pendingKeys.current = new Set(storageGet<string[]>(pendingStorageKey) ?? []);
    mounted.current = true;
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (mounted.current) userIdRef.current = user?.id ?? null;
    });
    return () => { mounted.current = false; };
  }, [pendingStorageKey]);

  const getDrawing = useCallback(
    (documentId: string, page: number): string | undefined =>
      drawings[`${documentId}:${page}`],
    [drawings],
  );

  const saveDrawing = useCallback((documentId: string, page: number, data: string) => {
    retainDocumentSnapshot(expectedOwner ?? userIdRef.current, documentId, `drawing:${page}`, data);
    const acknowledge = markPending([`${documentId}:${page}`]);
    setDrawings((prev) => {
      const next = { ...prev, [`${documentId}:${page}`]: data };
      storageSet(KEYS.DRAWINGS, next);
      return next;
    });
    if (userIdRef.current) {
      void dbSaveDrawing(documentId, String(page), data, expectedOwner ?? userIdRef.current ?? undefined).then(acknowledge).catch((error: unknown) => {
        console.warn('[Drawings] remote save failed; local drawing retained:', error);
      });
    }
  }, [markPending, expectedOwner]);

  // Called once per document open to seed Supabase drawings into local state.
  // Keep unsynced work across reloads and edits made while this fetch was pending.
  // Clean pages can still receive newer cloud drawings.
  const seedDrawings = useCallback((remoteDrawings: Record<string, string>) => {
    if (Object.keys(remoteDrawings).length === 0) return;
    console.log('[StudySync] seedDrawings called, remote keys:', Object.keys(remoteDrawings));
    setDrawings((prev) => {
      const incoming = Object.fromEntries(Object.entries(remoteDrawings).filter(([key]) => {
        const documentClear = `${key.slice(0, key.indexOf(':'))}:*`;
        return !pendingKeys.current.has(key) && !editedKeys.current.has(key)
          && !pendingKeys.current.has(documentClear) && !editedKeys.current.has(documentClear);
      }));
      const merged = { ...prev, ...incoming };
      const hasUpdates = Object.keys(incoming).some((k) => prev[k] !== incoming[k]);
      console.log('[StudySync] seedDrawings hasUpdates:', hasUpdates);
      if (!hasUpdates) return prev;
      storageSet(KEYS.DRAWINGS, merged);
      return merged;
    });
  }, []);

  const clearAllDrawings = useCallback((documentId: string) => {
    const prefix = `${documentId}:`;
    const stored = storageGet<Record<string, string>>(KEYS.DRAWINGS) ?? {};
    const keys = new Set([...Object.keys(stored), ...pendingKeys.current, ...editedKeys.current]);
    // Include pages that an in-flight initial fetch has not hydrated yet.
    keys.add(`${documentId}:*`);
    const acknowledge = markPending([...keys].filter((key) => key.startsWith(prefix)));
    setDrawings((prev) => {
      const prefix = `${documentId}:`;
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      storageSet(KEYS.DRAWINGS, next);
      return next;
    });
    if (userIdRef.current) {
      void dbDeleteAllDrawings(documentId).then(acknowledge).catch((error: unknown) => {
        console.warn('[Drawings] remote clear failed; local deletion retained:', error);
      });
    }
  }, [markPending]);

  return { getDrawing, saveDrawing, seedDrawings, clearAllDrawings };
}
