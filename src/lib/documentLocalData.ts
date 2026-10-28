import { KEYS, storageGet, storageSet } from './storage';
import { deletePdfBlob } from './pdfStore';

export function deletePendingDocumentNotes(docId: string) {
  if (typeof localStorage === 'undefined') return;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(`${KEYS.TEXT_NOTES}_pending_`)) continue;
    const notes = storageGet<Record<string, unknown>>(key) ?? {};
    storageSet(key, Object.fromEntries(Object.entries(notes).filter(([id]) => !id.startsWith(`${docId}:`))));
  }
}

/** Remove only this document's local data; other documents remain untouched. */
export async function deleteLocalDocument(docId: string) {
  await deletePdfBlob(docId);
  deletePendingDocumentNotes(docId);
  const drawingPendingKey = `${KEYS.DRAWINGS}_pending`;
  const drawingPending = storageGet<string[]>(drawingPendingKey);
  if (drawingPending) storageSet(drawingPendingKey, drawingPending.filter((key) => !key.startsWith(`${docId}:`)));
  const blankPendingKey = `${KEYS.BLANK_PAGES}_pending`;
  const blankPending = storageGet<string[]>(blankPendingKey);
  if (blankPending) storageSet(blankPendingKey, blankPending.filter((id) => id !== docId));
  for (const key of [KEYS.DRAWINGS, KEYS.TEXT_NOTES, KEYS.PAGE_IMAGES]) {
    const values = storageGet<Record<string, unknown>>(key) ?? {};
    storageSet(key, Object.fromEntries(Object.entries(values).filter(([id]) => id !== docId && !id.startsWith(`${docId}:`))));
  }
  for (const key of [KEYS.BLANK_PAGES, KEYS.VOICE_NOTES]) {
    const values = storageGet<Array<{ documentId: string }>>(key) ?? [];
    storageSet(key, values.filter((value) => value.documentId !== docId));
  }
  for (const key of [KEYS.BOOKMARKS, KEYS.KEY_TERMS, KEYS.ZOOM]) {
    const values = storageGet<Record<string, unknown>>(key) ?? {};
    delete values[docId];
    storageSet(key, values);
  }
  const pendingImagesKey = `${KEYS.PAGE_IMAGES}_pending`;
  const pendingImages = storageGet<string[]>(pendingImagesKey);
  if (pendingImages) storageSet(pendingImagesKey, pendingImages.filter((key) => !key.startsWith(`${docId}:`)));
  const map = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
  storageSet(KEYS.DOC_MAP, Object.fromEntries(Object.entries(map).filter(([, id]) => id !== docId)));
  if (storageGet<{ docId: string }>(KEYS.SESSION)?.docId === docId) storageSet(KEYS.SESSION, null);
}
