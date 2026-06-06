import { useState, useCallback, useEffect, useRef } from 'react';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { saveDrawing as dbSaveDrawing } from '@/lib/supabase/db';

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

  // Workspace page calls this when it loads a document's drawings from Supabase.
  // Merges remote drawings in; local state always wins on key conflicts.
  const seedDrawings = useCallback((remoteDrawings: Record<string, string>) => {
    console.log('[StudySync] seedDrawings called, keys:', Object.keys(remoteDrawings));
    setDrawings((prev) => {
      const merged = { ...remoteDrawings };
      for (const [key, val] of Object.entries(prev)) merged[key] = val;
      const hasNew = Object.keys(remoteDrawings).some((k) => !(k in prev));
      console.log('[StudySync] seedDrawings hasNew:', hasNew, 'prev keys:', Object.keys(prev), 'merged keys:', Object.keys(merged));
      if (!hasNew) return prev;
      storageSet(KEYS.DRAWINGS, merged);
      return merged;
    });
  }, []);

  return { getDrawing, saveDrawing, seedDrawings };
}
