'use client';
import { useState, useCallback } from 'react';
import type { PDFDocument } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';

let pdfjsCache: typeof import('pdfjs-dist') | null = null;

async function getPDFJS() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  pdfjsCache = pdfjs;
  return pdfjs;
}

// Returns a stable persistent ID for a filename, creating one if needed.
function getOrCreateDocId(filename: string): string {
  const map = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
  if (map[filename]) return map[filename];
  const id = crypto.randomUUID();
  map[filename] = id;
  storageSet(KEYS.DOC_MAP, map);
  return id;
}

// True if there is any saved annotation data for this document ID.
function hasStoredDataForDoc(docId: string): boolean {
  const prefix = `${docId}:`;

  const drawings = storageGet<Record<string, unknown>>(KEYS.DRAWINGS) ?? {};
  if (Object.keys(drawings).some((k) => k.startsWith(prefix))) return true;

  const blankPages = storageGet<Array<{ documentId: string }>>(KEYS.BLANK_PAGES) ?? [];
  if (blankPages.some((p) => p.documentId === docId)) return true;

  const textNotes = storageGet<Record<string, unknown[]>>(KEYS.TEXT_NOTES) ?? {};
  if (Object.keys(textNotes).some((k) => k.startsWith(prefix) && (textNotes[k]?.length ?? 0) > 0)) return true;

  const voiceNotes = storageGet<Array<{ documentId: string }>>(KEYS.VOICE_NOTES) ?? [];
  if (voiceNotes.some((n) => n.documentId === docId)) return true;

  return false;
}

export function usePDF() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const activeDocument = documents.find((d) => d.id === activeDocumentId) ?? null;

  const addDocument = useCallback(async (file: File): Promise<{ isRestored: boolean }> => {
    setIsLoading(true);
    try {
      const isPPTX = file.name.toLowerCase().endsWith('.pptx');
      const id = getOrCreateDocId(file.name);
      const isRestored = hasStoredDataForDoc(id);

      if (isPPTX) {
        const doc: PDFDocument = {
          id,
          name: file.name.replace(/\.pptx$/i, ''),
          url: '',
          pageCount: 1,
          currentPage: 1,
          type: 'pptx',
          slides: [],
        };
        setDocuments((prev) => [...prev, doc]);
        setActiveDocumentId(doc.id);
      } else {
        const url = URL.createObjectURL(file);
        const pdfjs = await getPDFJS();
        const pdf = await pdfjs.getDocument(url).promise;
        const pageCount = pdf.numPages;
        await pdf.destroy();
        const doc: PDFDocument = {
          id,
          name: file.name.replace(/\.pdf$/i, ''),
          url,
          pageCount,
          currentPage: 1,
          type: 'pdf',
        };
        setDocuments((prev) => [...prev, doc]);
        setActiveDocumentId(doc.id);
      }

      return { isRestored };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeDocument = useCallback(
    (id: string) => {
      setDocuments((prev) => {
        const doc = prev.find((d) => d.id === id);
        if (doc) URL.revokeObjectURL(doc.url);
        return prev.filter((d) => d.id !== id);
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
