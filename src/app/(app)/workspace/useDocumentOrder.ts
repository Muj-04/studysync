import { useState, useRef, useEffect, useCallback } from 'react';
import { loadDocumentOrder, saveDocumentOrder } from '@/lib/supabase/db';
import type { PDFDocument } from '@/types';

function applyDocOrder(docs: PDFDocument[], order: string[]): PDFDocument[] {
  const remaining = new Map(docs.map((doc) => [doc.id, doc]));
  const ordered: PDFDocument[] = [];
  for (const id of order) {
    const doc = remaining.get(id);
    if (!doc) continue;
    ordered.push(doc);
    remaining.delete(id);
  }
  return [...ordered, ...remaining.values()];
}

export function useDocumentOrder(documents: PDFDocument[], reorderDocuments: (documents: PDFDocument[]) => void) {
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const locallyReordered = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadDocumentOrder().then((order) => {
      if (!cancelled && !locallyReordered.current && order) setSavedOrder(order);
    }).catch(() => {
      // A failed preference read should leave the existing document order intact.
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (savedOrder.length === 0 || documents.length === 0) return;
    const ordered = applyDocOrder(documents, savedOrder);
    if (ordered.every((doc, index) => doc.id === documents[index]?.id)) return;
    reorderDocuments(ordered);
  }, [documents, savedOrder, reorderDocuments]);

  return useCallback((ids: string[]) => {
    locallyReordered.current = true;
    const ordered = applyDocOrder(documents, ids);
    const order = ordered.map((doc) => doc.id);
    setSavedOrder(order);
    reorderDocuments(ordered);
    void saveDocumentOrder(order);
  }, [documents, reorderDocuments]);
}
