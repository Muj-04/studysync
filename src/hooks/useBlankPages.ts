'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import type { BlankPage, CanvasImage } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { saveBlankPages as dbSaveBlankPages } from '@/lib/supabase/db';

export function useBlankPages() {
  const [blankPages, setBlankPages] = useState<BlankPage[]>([]);
  const blankPagesRef = useRef<BlankPage[]>([]);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = storageGet<BlankPage[]>(KEYS.BLANK_PAGES);
    if (stored?.length) {
      blankPagesRef.current = stored;
      setBlankPages(stored);
    }

    createClient().auth.getUser().then(({ data: { user } }) => {
      userIdRef.current = user?.id ?? null;
    });
  }, []);

  const persist = useCallback((pages: BlankPage[]) => {
    storageSet(KEYS.BLANK_PAGES, pages);
  }, []);

  // Syncs all pages for a document to Supabase (fire-and-forget).
  // Reads blankPagesRef which is always up-to-date (set inside setState updaters).
  const syncDoc = useCallback((docId: string) => {
    if (!userIdRef.current) return;
    const docPages = blankPagesRef.current.filter((p) => p.documentId === docId);
    dbSaveBlankPages(docId, docPages);
  }, []);

  const insertBlankPage = useCallback(
    (documentId: string, insertAfterPage: number, bgTheme: 'white' | 'dark' = 'white'): BlankPage => {
      const page: BlankPage = {
        id: crypto.randomUUID(),
        documentId,
        insertAfterPage,
        createdAt: Date.now(),
        bgTheme,
      };
      setBlankPages((prev) => {
        const next = [...prev, page];
        blankPagesRef.current = next;
        persist(next);
        return next;
      });
      syncDoc(documentId);
      return page;
    },
    [persist, syncDoc]
  );

  const removeBlankPage = useCallback((id: string) => {
    let docId: string | undefined;
    setBlankPages((prev) => {
      docId = prev.find((p) => p.id === id)?.documentId;
      const next = prev.filter((p) => p.id !== id);
      blankPagesRef.current = next;
      persist(next);
      return next;
    });
    if (docId) syncDoc(docId);
  }, [persist, syncDoc]);

  const updateCanvasData = useCallback((id: string, data: string) => {
    let docId: string | undefined;
    setBlankPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, canvasData: data } : p));
      docId = prev.find((p) => p.id === id)?.documentId;
      blankPagesRef.current = next;
      persist(next);
      return next;
    });
    if (docId) syncDoc(docId);
  }, [persist, syncDoc]);

  const updateImages = useCallback((id: string, images: CanvasImage[]) => {
    let docId: string | undefined;
    setBlankPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, images } : p));
      docId = prev.find((p) => p.id === id)?.documentId;
      blankPagesRef.current = next;
      persist(next);
      return next;
    });
    if (docId) syncDoc(docId);
  }, [persist, syncDoc]);

  const updateBgTheme = useCallback((id: string, bgTheme: 'white' | 'dark') => {
    let docId: string | undefined;
    setBlankPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, bgTheme } : p));
      docId = prev.find((p) => p.id === id)?.documentId;
      blankPagesRef.current = next;
      persist(next);
      return next;
    });
    if (docId) syncDoc(docId);
  }, [persist, syncDoc]);

  const removePagesForDocument = useCallback((docId: string) => {
    setBlankPages((prev) => {
      const next = prev.filter((p) => p.documentId !== docId);
      blankPagesRef.current = next;
      persist(next);
      return next;
    });
  }, [persist]);

  const getBlankPagesForDocument = useCallback(
    (documentId: string): BlankPage[] => blankPages.filter((p) => p.documentId === documentId),
    [blankPages]
  );

  // Workspace page calls this after loading a document's blank pages from Supabase.
  // Only adds pages not already in state; local state wins on ID conflicts.
  const seedBlankPages = useCallback((pages: BlankPage[]) => {
    setBlankPages((prev) => {
      const prevIds = new Set(prev.map((p) => p.id));
      const newOnes = pages.filter((p) => !prevIds.has(p.id));
      if (newOnes.length === 0) return prev;
      const next = [...prev, ...newOnes];
      blankPagesRef.current = next;
      storageSet(KEYS.BLANK_PAGES, next);
      return next;
    });
  }, []);

  return {
    insertBlankPage,
    removeBlankPage,
    removePagesForDocument,
    updateCanvasData,
    updateImages,
    updateBgTheme,
    getBlankPagesForDocument,
    seedBlankPages,
  };
}
