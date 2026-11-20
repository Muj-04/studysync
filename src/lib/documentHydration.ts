import { KEYS, storageGet } from '@/lib/storage';
import { admitDocumentCollection, withholdDocumentCollection } from '@/lib/documentOutbox';
import type { DocumentCollection, DocumentReadBatch } from '@/lib/supabase/documentCollections';

const current = new Map<string, symbol>();
/** A fetch is not an adopted editor snapshot until every required read succeeds. */
export function beginDocumentHydration(owner: string, doc: string, collections: DocumentCollection[]): DocumentReadBatch & { complete(): void; cancel(): void } {
  const token = Symbol();
  const pending: { collection: DocumentCollection; rows: Record<string, unknown>[]; observe: () => void }[] = [];
  let active = true;
  const key = (collection: string) => JSON.stringify([owner, doc, collection]);
  const localBookmarks = storageGet<Record<string, { id: string }[]>>(KEYS.BOOKMARKS)?.[doc] ?? [];
  for (const collection of collections) {
    current.set(key(collection), token);
    let pages: string[] = [];
    if (collection === 'drawings' || collection === 'text_notes') {
      const stored = storageGet<Record<string, unknown>>(collection === 'drawings' ? KEYS.DRAWINGS : KEYS.TEXT_NOTES) ?? {};
      pages = Object.keys(stored).filter(page => page.startsWith(`${doc}:`)).map(page => page.slice(doc.length + 1));
    } else if (collection === 'page_image_annotations') {
      pages = Object.keys(storageGet<Record<string, Record<string, unknown>>>(KEYS.PAGE_IMAGES)?.[doc] ?? {});
    } else if (collection === 'blank_pages' || collection === 'bookmarks') pages = [''];
    for (const page of pages) withholdDocumentCollection(owner, doc, collection, page);
  }
  return {
    accept(collection, rows, observe) { if (active) pending.push({ collection, rows, observe }); },
    cancel() { active = false; pending.length = 0; },
    complete() {
      if (!active) return;
      active = false;
      for (const { collection, rows, observe } of pending) {
        if (current.get(key(collection)) !== token) continue;
        // Missing cached pages are deliberately retained by the UI. They have
        // not adopted the empty remote scope and must remain recovery-only.
        let pages: string[] = [];
        if (collection === 'drawings') pages = rows.filter(row => Boolean(row.canvas_data)).map(row => String(row.page_key));
        else if (collection === 'text_notes') pages = rows.map(row => String(row.page_key));
        else if (collection === 'page_image_annotations') pages = rows.map(row => String(row.page_number));
        else if (collection === 'blank_pages') pages = [''];
        else if (collection === 'bookmarks' && localBookmarks.every(local => rows.some(row => row.id === local.id))) pages = [''];
        for (const page of pages) admitDocumentCollection(owner, doc, collection, page);
        observe();
      }
      pending.length = 0;
    },
  };
}
