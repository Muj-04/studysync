'use client';
import { useState, useCallback } from 'react';
import type { PDFDocument } from '@/types';

let pdfjsCache: typeof import('pdfjs-dist') | null = null;

async function getPDFJS() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  pdfjsCache = pdfjs;
  return pdfjs;
}

export function usePDF() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const activeDocument = documents.find((d) => d.id === activeDocumentId) ?? null;

  const addDocument = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const url = URL.createObjectURL(file);
      const pdfjs = await getPDFJS();
      const pdf = await pdfjs.getDocument(url).promise;
      const pageCount = pdf.numPages;
      await pdf.destroy();

      const doc: PDFDocument = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.pdf$/i, ''),
        url,
        pageCount,
        currentPage: 1,
      };

      setDocuments((prev) => [...prev, doc]);
      setActiveDocumentId(doc.id);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeDocument = useCallback(
    (id: string) => {
      setDocuments((prev) => {
        const doc = prev.find((d) => d.id === id);
        if (doc) URL.revokeObjectURL(doc.url);
        const remaining = prev.filter((d) => d.id !== id);
        return remaining;
      });
      setActiveDocumentId((prev) => {
        if (prev !== id) return prev;
        const remaining = documents.filter((d) => d.id !== id);
        return remaining[remaining.length - 1]?.id ?? null;
      });
    },
    [documents]
  );

  const goToPage = useCallback(
    (page: number) => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === activeDocumentId
            ? { ...d, currentPage: Math.max(1, Math.min(page, d.pageCount)) }
            : d
        )
      );
    },
    [activeDocumentId]
  );

  const nextPage = useCallback(() => {
    if (activeDocument) goToPage(activeDocument.currentPage + 1);
  }, [activeDocument, goToPage]);

  const prevPage = useCallback(() => {
    if (activeDocument) goToPage(activeDocument.currentPage - 1);
  }, [activeDocument, goToPage]);

  return {
    documents,
    activeDocument,
    activeDocumentId,
    isLoading,
    addDocument,
    removeDocument,
    setActiveDocument: setActiveDocumentId,
    goToPage,
    nextPage,
    prevPage,
  };
}
