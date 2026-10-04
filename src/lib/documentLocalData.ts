import { KEYS, storageGet, storageSet } from './storage';
import { deletePdfBlob } from './pdfStore';

/** Remove only this document's local data; other documents remain untouched. */
export async function deleteLocalDocument(docId: string) {
  await deletePdfBlob(docId);
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
  const map = storageGet<Record<string, string>>(KEYS.DOC_MAP) ?? {};
  storageSet(KEYS.DOC_MAP, Object.fromEntries(Object.entries(map).filter(([, id]) => id !== docId)));
  if (storageGet<{ docId: string }>(KEYS.SESSION)?.docId === docId) storageSet(KEYS.SESSION, null);
}
