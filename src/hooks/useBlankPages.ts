'use client';
import { useState, useCallback } from 'react';
import type { BlankPage, CanvasImage } from '@/types';

export function useBlankPages() {
  const [blankPages, setBlankPages] = useState<BlankPage[]>([]);

  const insertBlankPage = useCallback(
    (documentId: string, insertAfterPage: number, bgTheme: 'white' | 'dark' = 'white'): BlankPage => {
      const page: BlankPage = {
        id: crypto.randomUUID(),
        documentId,
        insertAfterPage,
        createdAt: Date.now(),
        bgTheme,
      };
      setBlankPages((prev) => [...prev, page]);
      return page;
    },
    []
  );

  const removeBlankPage = useCallback((id: string) => {
    setBlankPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateCanvasData = useCallback((id: string, data: string) => {
    setBlankPages((prev) => prev.map((p) => (p.id === id ? { ...p, canvasData: data } : p)));
  }, []);

  const updateImages = useCallback((id: string, images: CanvasImage[]) => {
    setBlankPages((prev) => prev.map((p) => (p.id === id ? { ...p, images } : p)));
  }, []);

  const updateBgTheme = useCallback((id: string, bgTheme: 'white' | 'dark') => {
    setBlankPages((prev) => prev.map((p) => (p.id === id ? { ...p, bgTheme } : p)));
  }, []);

  const getBlankPagesForDocument = useCallback(
    (documentId: string): BlankPage[] => blankPages.filter((p) => p.documentId === documentId),
    [blankPages]
  );

  return { insertBlankPage, removeBlankPage, updateCanvasData, updateImages, updateBgTheme, getBlankPagesForDocument };
}
