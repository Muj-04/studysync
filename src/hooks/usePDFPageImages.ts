import { useState, useCallback, useRef, useEffect } from 'react';
import { storageGet, storageSet, KEYS } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { savePageImages as dbSavePageImages, fetchAllPageImages } from '@/lib/supabase/db';
import { createDocumentSaveQueue } from '@/lib/persistence/documentSaveQueue';
import type { PDFPageImage } from '@/types';

type PageImagesMap = Record<number, PDFPageImage[]>;

export function usePDFPageImages() {
  const [allPageImages, setAllPageImages] = useState<Record<string, PageImagesMap>>({});
  const imagesRef = useRef<Record<string, PageImagesMap>>({});
  const pendingPages = useRef(new Set<string>());
  const editedPages = useRef(new Set<string>());
  const pendingKey = `${KEYS.PAGE_IMAGES}_pending`;
  useEffect(() => {
    pendingPages.current = new Set(storageGet<string[]>(pendingKey) ?? []);
  }, [pendingKey]);
  const [saves] = useState(() => createDocumentSaveQueue((error) => {
    console.warn('[PageImages] remote save failed; local images retained:', error);
  }));
  useEffect(() => () => saves.clear(), [saves]);
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
    const docMap = { ...(imagesRef.current[docId] ?? {}), [pageNumber]: images };
    imagesRef.current = { ...imagesRef.current, [docId]: docMap };
    setAllPageImages(imagesRef.current);
    const stored = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
    storageSet(KEYS.PAGE_IMAGES, { ...stored, [docId]: docMap });
    const pageKey = `${docId}:${pageNumber}`;
    pendingPages.current.add(pageKey);
    editedPages.current.add(pageKey);
    storageSet(pendingKey, [...pendingPages.current]);
    saves.schedule(docId, String(pageNumber), async (isCurrent) => {
      const uid = await ensureUserId();
      if (!uid || !isCurrent()) return;
      await dbSavePageImages(docId, pageNumber, images);
      // A superseded/cancelled save must not acknowledge a later edit or mount.
      if (!isCurrent() || storageGet(pendingKey) === null) return;
      pendingPages.current.delete(pageKey);
      storageSet(pendingKey, [...pendingPages.current]);
    });
  }, [ensureUserId, saves, pendingKey]);

  const seedPageImages = useCallback((docId: string, remote: Record<number, PDFPageImage[]>) => {
    // Load from localStorage first
    const stored = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
    // In-memory edits also win if browser storage is unavailable or full.
    const local = { ...(stored[docId] ?? {}), ...(imagesRef.current[docId] ?? {}) };
    const merged: PageImagesMap = { ...local };
    for (const [k, v] of Object.entries(remote)) {
      const pageKey = `${docId}:${k}`;
      if (!pendingPages.current.has(pageKey) && !editedPages.current.has(pageKey)) merged[Number(k)] = v;
    }
    const hasRemote = Object.keys(remote).length > 0;
    const existing = imagesRef.current[docId] ?? {};
    if (hasRemote || Object.keys(existing).join(',') !== Object.keys(merged).join(',')) {
      imagesRef.current = { ...imagesRef.current, [docId]: merged };
      setAllPageImages(imagesRef.current);
    }
    if (hasRemote) {
      const stored2 = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
      storageSet(KEYS.PAGE_IMAGES, { ...stored2, [docId]: merged });
    }
  }, []);

  const loadLocalPageImages = useCallback((docId: string) => {
    const stored = storageGet<Record<string, PageImagesMap>>(KEYS.PAGE_IMAGES) ?? {};
    const local = stored[docId];
    if (!local) return;
    if (imagesRef.current[docId]) return;
    imagesRef.current = { ...imagesRef.current, [docId]: local };
    setAllPageImages(imagesRef.current);
  }, []);

  const deletePageImage = useCallback((docId: string, pageNumber: number, imageId: string) => {
    const images = imagesRef.current[docId]?.[pageNumber] ?? [];
    setPageImages(docId, pageNumber, images.filter((image) => image.id !== imageId));
  }, [setPageImages]);

  const removePageImagesForDocument = useCallback((docId: string) => {
    saves.cancelDocument(docId);
    for (const key of pendingPages.current) {
      if (key.startsWith(`${docId}:`)) pendingPages.current.delete(key);
    }
    storageSet(pendingKey, [...pendingPages.current]);
    const next = { ...imagesRef.current };
    delete next[docId];
    imagesRef.current = next;
    setAllPageImages(next);
    const stored = storageGet<Record<string, unknown>>(KEYS.PAGE_IMAGES) ?? {};
    delete stored[docId];
    storageSet(KEYS.PAGE_IMAGES, stored);
  }, [saves, pendingKey]);

  return { getPageImages, setPageImages, seedPageImages, loadLocalPageImages, deletePageImage, removePageImagesForDocument, allPageImages, fetchAllPageImages };
}
