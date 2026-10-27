'use client';
import { useState, useCallback, useEffect } from 'react';
import type { PDFDocument } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { savePdfBlob, deletePdfBlob, getAllStoredDocIds, getStoredPdf } from '@/lib/pdfStore';

import { identifyPdf } from '@/lib/documentIdentity';
import { fetchDocuments } from '@/lib/supabase/db';

let pdfjsCache: typeof import('pdfjs-dist') | null = null;

async function getPDFJS() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  pdfjsCache = pdfjs;
  return pdfjs;
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

export function usePDF({ persist = true }: { persist?: boolean } = {}) {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const activeDocument = documents.find((d) => d.id === activeDocumentId) ?? null;

  // Auto-restore previously opened PDFs from IndexedDB on mount
  useEffect(() => {
    if (!persist) return;
    let cancelled = false;
    (async () => {
      const docMap = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
      const storedIds = await getAllStoredDocIds();
      if (cancelled || storedIds.length === 0) return;

      const cloudDocuments = await fetchDocuments().catch(() => []);
      const pdfjs = await getPDFJS();
      const restored: PDFDocument[] = [];

      for (const docId of storedIds) {
        const stored = await getStoredPdf(docId);
        const blob = stored?.blob;
        if (!blob || cancelled) continue;
        const filename = stored?.filename ?? Object.keys(docMap).find((k) => docMap[k] === docId) ?? cloudDocuments.find((d) => d.id === docId)?.name;
        if (filename && !stored?.filename) await savePdfBlob(docId, blob, { filename, fingerprint: stored?.fingerprint });
        const url = URL.createObjectURL(blob);
        try {
          const pdf = await pdfjs.getDocument({ url }).promise;
          const pageCount = pdf.numPages;
          await pdf.loadingTask.destroy();
          restored.push({
            id: docId,
            name: filename?.replace(/\.pdf$/i, '') ?? 'Document',
            url,
            pageCount,
            currentPage: 1,
            type: 'pdf',
          });
        } catch {
          URL.revokeObjectURL(url);
        }
      }

      if (!cancelled && restored.length > 0) {
        setDocuments((prev) => {
          const existingIds = new Set(prev.map((d) => d.id));
          const newDocs = restored.filter((d) => !existingIds.has(d.id));
          return [...prev, ...newDocs];
        });
        // Activate last session doc if nothing is active yet
        const session = storageGet<{ docId: string }>(KEYS.SESSION);
        if (session?.docId && restored.some((d) => d.id === session.docId)) {
          setActiveDocumentId((prev) => prev ?? session.docId);
        }
      }
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [persist]);

  const addDocument = useCallback(async (file: File, explicitId?: string): Promise<{ isRestored: boolean; id: string }> => {
    setIsLoading(true);
    try {
      const isPPTX = file.name.toLowerCase().endsWith('.pptx');
      const { id, fingerprint } = persist && !isPPTX
        ? await identifyPdf(file, explicitId)
        : { id: explicitId ?? crypto.randomUUID(), fingerprint: undefined };
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
        const pdf = await pdfjs.getDocument({ url }).promise;
        const pageCount = pdf.numPages;
        await pdf.loadingTask.destroy();
        if (persist) await savePdfBlob(id, file, { filename: file.name, fingerprint });
        const doc: PDFDocument = {
          id,
          name: file.name.replace(/\.pdf$/i, ''),
          url,
          pageCount,
          currentPage: 1,
          type: 'pdf',
        };
        setDocuments((prev) => {
          // Replace if already loaded from IndexedDB restore
          const exists = prev.find((d) => d.id === id);
          if (exists) {
            URL.revokeObjectURL(exists.url);
            return prev.map((d) => d.id === id ? doc : d);
          }
          return [...prev, doc];
        });
        setActiveDocumentId(doc.id);
      }

      return { isRestored, id };
    } finally {
      setIsLoading(false);
    }
  }, [persist]);

  // Called when Supabase returns a canonical ID different from the locally-generated one.
  const updateDocumentId = useCallback((oldId: string, newId: string) => {
    setDocuments((prev) => prev.map((d) => d.id === oldId ? { ...d, id: newId } : d));
    setActiveDocumentId((prev) => prev === oldId ? newId : prev);
    const docMap = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
    const filename = Object.keys(docMap).find((k) => docMap[k] === oldId);
    if (filename) {
      docMap[filename] = newId;
      storageSet(KEYS.DOC_MAP, docMap);
    }
    // Migrate IndexedDB blob to new ID
    getStoredPdf(oldId).then((stored) => {
      if (stored) {
        savePdfBlob(newId, stored.blob, { filename: stored.filename, fingerprint: stored.fingerprint }).then(() => deletePdfBlob(oldId)).catch(console.error);
      }
    }).catch(console.error);
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
      if (persist) deletePdfBlob(id).catch(console.error);
    },
    [documents, persist]
  );

  const reorderDocuments = useCallback((newDocs: PDFDocument[]) => {
    setDocuments(newDocs);
  }, []);

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
    updateDocumentId,
    reorderDocuments,
    setActiveDocument: setActiveDocumentId,
    goToPage,
    nextPage,
    prevPage,
  };
}
