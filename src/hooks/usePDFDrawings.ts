import { useState, useCallback, useEffect, useRef } from 'react';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { saveDrawing as dbSaveDrawing, deleteAllDrawings as dbDeleteAllDrawings } from '@/lib/supabase/db';

export function usePDFDrawings() {
  const [drawings, setDrawings] = useState<Record<string, string>>({});
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = storageGet<Record<string, string>>(KEYS.DRAWINGS);
    if (stored && Object.keys(stored).length > 0) setDrawings(stored);

    createClient().auth.getUser().then(({ data: { user } }) => {
      userIdRef.current = user?.id ?? null;
    });
  }, []);

  const getDrawing = useCallback(
    (documentId: string, page: number): string | undefined =>
      drawings[`${documentId}:${page}`],
    [drawings],
  );

  const saveDrawing = useCallback((documentId: string, page: number, data: string) => {
    setDrawings((prev) => {
      const next = { ...prev, [`${documentId}:${page}`]: data };
      storageSet(KEYS.DRAWINGS, next);
      return next;
    });
    if (userIdRef.current) {
      dbSaveDrawing(documentId, String(page), data);
    }
  }, []);

  // Called once per document open to seed Supabase drawings into local state.
  // Remote wins for keys Supabase knows about (authoritative on load).
  // Local-only keys (drawings made this session not yet reflected in remote) are kept.
  const seedDrawings = useCallback((remoteDrawings: Record<string, string>) => {
    if (Object.keys(remoteDrawings).length === 0) return;
    console.log('[StudySync] seedDrawings called, remote keys:', Object.keys(remoteDrawings));
    setDrawings((prev) => {
      // Spread order: prev first, then remote overwrites matching keys
      const merged = { ...prev, ...remoteDrawings };
      const hasUpdates = Object.keys(remoteDrawings).some((k) => prev[k] !== remoteDrawings[k]);
      console.log('[StudySync] seedDrawings hasUpdates:', hasUpdates);
      if (!hasUpdates) return prev;
      storageSet(KEYS.DRAWINGS, merged);
      return merged;
    });
  }, []);

  const clearAllDrawings = useCallback((documentId: string) => {
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
      dbDeleteAllDrawings(documentId);
    }
  }, []);

  return { getDrawing, saveDrawing, seedDrawings, clearAllDrawings };
}
