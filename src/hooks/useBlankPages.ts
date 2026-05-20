'use client';
import { useState, useCallback } from 'react';
import type { BlankPage, CanvasImage } from '@/types';
import { storageGet, storageSet, KEYS } from '@/lib/storage';

export function useBlankPages() {
  const [blankPages, setBlankPages] = useState<BlankPage[]>(
    () => storageGet<BlankPage[]>(KEYS.BLANK_PAGES) ?? []
  );

  const persist = useCallback((pages: BlankPage[]) => {
    storageSet(KEYS.BLANK_PAGES, pages);
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
        persist(next);
        return next;
      });
      return page;
    },
    [persist]
  );

  const removeBlankPage = useCallback((id: string) => {
    setBlankPages((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  const updateCanvasData = useCallback((id: string, data: string) => {
    setBlankPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, canvasData: data } : p));
      persist(next);
      return next;
    });
  }, [persist]);

  const updateImages = useCallback((id: string, images: CanvasImage[]) => {
    setBlankPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, images } : p));
      persist(next);
      return next;
    });
  }, [persist]);

  const updateBgTheme = useCallback((id: string, bgTheme: 'white' | 'dark') => {
    setBlankPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, bgTheme } : p));
      persist(next);
      return next;
    });
  }, [persist]);

  const getBlankPagesForDocument = useCallback(
    (documentId: string): BlankPage[] => blankPages.filter((p) => p.documentId === documentId),
    [blankPages]
  );

  return { insertBlankPage, removeBlankPage, updateCanvasData, updateImages, updateBgTheme, getBlankPagesForDocument };
}
