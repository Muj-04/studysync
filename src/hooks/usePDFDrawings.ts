import { useState, useCallback, useEffect } from 'react';
import { storageGet, storageSet, KEYS } from '@/lib/storage';

export function usePDFDrawings() {
  const [drawings, setDrawings] = useState<Record<string, string>>({});

  useEffect(() => {
    const stored = storageGet<Record<string, string>>(KEYS.DRAWINGS);
    if (stored && Object.keys(stored).length > 0) setDrawings(stored);
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
  }, []);

  return { getDrawing, saveDrawing };
}
