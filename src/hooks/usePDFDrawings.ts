import { useState, useCallback } from 'react';

export function usePDFDrawings() {
  const [drawings, setDrawings] = useState<Record<string, string>>({});

  const getDrawing = useCallback(
    (documentId: string, page: number): string | undefined =>
      drawings[`${documentId}:${page}`],
    [drawings],
  );

  const saveDrawing = useCallback((documentId: string, page: number, data: string) => {
    setDrawings((prev) => ({ ...prev, [`${documentId}:${page}`]: data }));
  }, []);

  return { getDrawing, saveDrawing };
}
