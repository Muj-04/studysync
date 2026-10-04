'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import type { BlankPage, CanvasImage } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { saveBlankPages as dbSaveBlankPages } from '@/lib/supabase/db';

export function useBlankPages() {
  const [blankPages, setBlankPages] = useState<BlankPage[]>([]);
  const blankPagesRef = useRef<BlankPage[]>([]);

  useEffect(() => {
    const stored = storageGet<BlankPage[]>(KEYS.BLANK_PAGES);
    if (stored?.length) {
      blankPagesRef.current = stored;
    // Browser storage is restored after hydration to keep server/client markup consistent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlankPages(stored);
    }

  }, []);

  const commit = useCallback((pages: BlankPage[], docId?: string) => {
    blankPagesRef.current = pages;
    storageSet(KEYS.BLANK_PAGES, pages);
    setBlankPages(pages);
    if (docId) {
      void dbSaveBlankPages(docId, pages.filter((page) => page.documentId === docId))
        .catch((error: unknown) => console.error('Blank pages could not be synced; local copy retained', error));
    }
  }, []);

  const insertBlankPage = useCallback((documentId: string, insertAfterPage: number, bgTheme: 'white' | 'dark' = 'white'): BlankPage => {
    const page: BlankPage = { id: crypto.randomUUID(), documentId, insertAfterPage, createdAt: Date.now(), bgTheme };
    commit([...blankPagesRef.current, page], documentId);
    return page;
  }, [commit]);

  const removeBlankPage = useCallback((id: string) => {
    const page = blankPagesRef.current.find((p) => p.id === id);
    if (page) commit(blankPagesRef.current.filter((p) => p.id !== id), page.documentId);
  }, [commit]);

  const updatePage = useCallback((id: string, patch: Partial<BlankPage>) => {
    const page = blankPagesRef.current.find((p) => p.id === id);
    if (page) commit(blankPagesRef.current.map((p) => p.id === id ? { ...p, ...patch } : p), page.documentId);
  }, [commit]);

  const updateCanvasData = useCallback((id: string, canvasData: string) => updatePage(id, { canvasData }), [updatePage]);
  const updateImages = useCallback((id: string, images: CanvasImage[]) => updatePage(id, { images }), [updatePage]);
  const updateBgTheme = useCallback((id: string, bgTheme: 'white' | 'dark') => updatePage(id, { bgTheme }), [updatePage]);
  const removePagesForDocument = useCallback((docId: string) => {
    commit(blankPagesRef.current.filter((p) => p.documentId !== docId));
  }, [commit]);

  const getBlankPagesForDocument = useCallback(
    (documentId: string): BlankPage[] => blankPages.filter((p) => p.documentId === documentId),
    [blankPages]
  );

  // Workspace page calls this after loading a document's blank pages from Supabase.
  // Only adds pages not already in state; local state wins on ID conflicts.
  const seedBlankPages = useCallback((pages: BlankPage[]) => {
    const ids = new Set(blankPagesRef.current.map((p) => p.id));
    const incoming = pages.filter((p) => !ids.has(p.id));
    if (incoming.length) commit([...blankPagesRef.current, ...incoming]);
  }, [commit]);

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
