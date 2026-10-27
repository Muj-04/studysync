'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import type { BlankPage, CanvasImage } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { saveBlankPages as dbSaveBlankPages } from '@/lib/supabase/db';

export function useBlankPages() {
  const [blankPages, setBlankPages] = useState<BlankPage[]>([]);
  const blankPagesRef = useRef<BlankPage[]>([]);
  const pendingDocuments = useRef(new Set<string>());
  const editedDocuments = useRef(new Set<string>());
  const versions = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const pendingKey = `${KEYS.BLANK_PAGES}_pending`;


  useEffect(() => {
    mounted.current = true;
    pendingDocuments.current = new Set(storageGet<string[]>(pendingKey) ?? []);
    const stored = storageGet<BlankPage[]>(KEYS.BLANK_PAGES);
    if (stored?.length) {
      blankPagesRef.current = stored;
    // Browser storage is restored after hydration to keep server/client markup consistent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlankPages(stored);
    }
    return () => { mounted.current = false; };
  }, [pendingKey]);

  const commit = useCallback((pages: BlankPage[], docId?: string) => {
    blankPagesRef.current = pages;
    storageSet(KEYS.BLANK_PAGES, pages);
    setBlankPages(pages);
    if (docId) {
      const version = (versions.current.get(docId) ?? 0) + 1;
      versions.current.set(docId, version);
      pendingDocuments.current.add(docId);
      editedDocuments.current.add(docId);
      storageSet(pendingKey, [...pendingDocuments.current]);
      void dbSaveBlankPages(docId, pages.filter((page) => page.documentId === docId))
        .then(() => {
          if (!mounted.current || versions.current.get(docId) !== version || storageGet(pendingKey) === null) return;
          pendingDocuments.current.delete(docId);
          storageSet(pendingKey, [...pendingDocuments.current]);
        })
        .catch((error: unknown) => console.error('Blank pages could not be synced; local copy retained', error));
    }
  }, [pendingKey]);

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
    versions.current.set(docId, (versions.current.get(docId) ?? 0) + 1);
    pendingDocuments.current.delete(docId);
    editedDocuments.current.add(docId);
    storageSet(pendingKey, [...pendingDocuments.current]);
    commit(blankPagesRef.current.filter((p) => p.documentId !== docId));
  }, [commit, pendingKey]);

  const getBlankPagesForDocument = useCallback(
    (documentId: string): BlankPage[] => blankPages.filter((p) => p.documentId === documentId),
    [blankPages]
  );

  // Replace clean document snapshots, including remotely deleted pages. A
  // failed local mutation keeps the whole collection, even when it is empty.
  const seedBlankPages = useCallback((pages: BlankPage[], documentId?: string) => {
    const documents = new Set(documentId ? [documentId] : pages.map((page) => page.documentId));
    for (const id of documents) {
      if (pendingDocuments.current.has(id) || editedDocuments.current.has(id)) documents.delete(id);
    }
    if (documents.size === 0) return;
    commit([
      ...blankPagesRef.current.filter((page) => !documents.has(page.documentId)),
      ...pages.filter((page) => documents.has(page.documentId)),
    ]);
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
