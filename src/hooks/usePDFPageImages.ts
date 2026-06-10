import { useState, useCallback, useRef } from 'react';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { savePageImages as dbSavePageImages, fetchAllPageImages } from '@/lib/supabase/db';
import type { PDFPageImage } from '@/types';

type PageImagesMap = Record<number, PDFPageImage[]>;

export function usePDFPageImages() {
  const [allPageImages, setAllPageImages] = useState<Record<string, PageImagesMap>>({});
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const userIdRef = useRef<string | null>(null);

  const ensureUserId = useCallback(async () => {
    if (userIdRef.current !== null) return userIdRef.current;
    const { data: { user } } = await createClient().auth.getUser();
    userIdRef.current = user?.id ?? null;
    return userIdRef.current;
  }, []);

  const getPageImages = useCallback((docId: string, pageNumber: number): PDFPageImage[] => {
    return allPageImages[docId]?.[pageNumber] ?? [];
  }, [allPageImages]);

  const setPageImages = useCallback((docId: string, pageNumber: number, images: PDFPageImage[]) => {
    setAllPageImages((prev) => {
      const docMap = { ...(prev[docId] ?? {}), [pageNumber]: images };
      const next = { ...prev, [docId]: docMap };
      // Persist all images for this doc to localStorage
      const stored = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
      storageSet(KEYS.PAGE_IMAGES, { ...stored, [docId]: docMap });
      return next;
    });
    // Debounced Supabase save
    const timerKey = `${docId}:${pageNumber}`;
    if (saveTimerRef.current[timerKey]) clearTimeout(saveTimerRef.current[timerKey]);
    saveTimerRef.current[timerKey] = setTimeout(async () => {
      const uid = await ensureUserId();
      if (uid) dbSavePageImages(docId, pageNumber, images);
    }, 600);
  }, [ensureUserId]);

  const seedPageImages = useCallback((docId: string, remote: Record<number, PDFPageImage[]>) => {
    // Load from localStorage first
    const stored = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
    const local = stored[docId] ?? {};
    const merged: PageImagesMap = { ...local };
    for (const [k, v] of Object.entries(remote)) {
      merged[Number(k)] = v;
    }
    const hasRemote = Object.keys(remote).length > 0;
    setAllPageImages((prev) => {
      const existing = prev[docId] ?? {};
      const existingKeys = Object.keys(existing).join(',');
      const mergedKeys = Object.keys(merged).join(',');
      if (!hasRemote && existingKeys === mergedKeys) return prev;
      return { ...prev, [docId]: merged };
    });
    if (hasRemote) {
      const stored2 = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
      storageSet(KEYS.PAGE_IMAGES, { ...stored2, [docId]: merged });
    }
  }, []);

  const loadLocalPageImages = useCallback((docId: string) => {
    const stored = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
    const local = stored[docId];
    if (!local) return;
    setAllPageImages((prev) => {
      if (prev[docId]) return prev; // already have data
      return { ...prev, [docId]: local };
    });
  }, []);

  const deletePageImage = useCallback((docId: string, pageNumber: number, imageId: string) => {
    setAllPageImages((prev) => {
      const pageImages = prev[docId]?.[pageNumber] ?? [];
      const next = pageImages.filter((img) => img.id !== imageId);
      const docMap = { ...(prev[docId] ?? {}), [pageNumber]: next };
      const newState = { ...prev, [docId]: docMap };
      const stored = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
      storageSet(KEYS.PAGE_IMAGES, { ...stored, [docId]: docMap });
      // Debounced save
      const timerKey = `${docId}:${pageNumber}`;
      if (saveTimerRef.current[timerKey]) clearTimeout(saveTimerRef.current[timerKey]);
      saveTimerRef.current[timerKey] = setTimeout(async () => {
        const uid = await ensureUserId();
        if (uid) dbSavePageImages(docId, pageNumber, next);
      }, 600);
      return newState;
    });
  }, [ensureUserId]);

  const removePageImagesForDocument = useCallback((docId: string) => {
    setAllPageImages((prev) => {
      const next = { ...prev };
      delete next[docId];
      const stored = storageGet<Record<string, unknown>>(KEYS.PAGE_IMAGES) ?? {};
      delete stored[docId];
      storageSet(KEYS.PAGE_IMAGES, stored);
      return next;
    });
  }, []);

  return { getPageImages, setPageImages, seedPageImages, loadLocalPageImages, deletePageImage, removePageImagesForDocument, allPageImages, fetchAllPageImages };
}
