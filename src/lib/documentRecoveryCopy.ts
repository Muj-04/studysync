import { listDocumentWrites, observeDocumentCollection } from '@/lib/documentOutbox';
import { listLocalDocumentRecovery } from '@/lib/documentRecovery';
import { KEYS } from '@/lib/storage';
import { assertDocumentOwner, registerDocument } from '@/lib/supabase/documentProtocol';
import { writeDocumentCollection, type DocumentCollection } from '@/lib/supabase/documentCollections';
import { getStoredPdf, savePdfBlob } from '@/lib/pdfStore';

type Row = Record<string, unknown>;
type Payload = { collection: DocumentCollection; pageKey: string; rows: Row[] };
/** Build a copy from retained local data, never silently read a newer remote edit. */
export function recoveryPayloads(owner: string, documentId: string): Payload[] {
  const payloads = new Map<string, Payload>();
  const put = (collection: DocumentCollection, pageKey: string, rows: Row[]) => payloads.set(`${collection}:${pageKey}`, { collection, pageKey, rows });
  const snapshot = listLocalDocumentRecovery(owner).find(entry => entry.documentId === documentId)?.snapshots ?? {};
  const text = (rows: Row[]) => rows.map(row => ({ ...row, font_size: row.fontSize ?? row.font_size }));
  const blanks = (rows: Row[]) => rows.map(row => ({ ...row, insert_after_page: row.insertAfterPage ?? row.insert_after_page, canvas_data: row.canvasData ?? row.canvas_data ?? null, bg_theme: row.bgTheme ?? row.bg_theme ?? 'white', created_at: row.createdAt ?? row.created_at }));
  for (const entry of listDocumentWrites(owner).filter(entry => entry.documentId === documentId)) put(entry.collection as DocumentCollection, entry.pageKey, entry.rows as Row[]);
  // Older whole-document recovery snapshots are the base; per-page edits win.
  for (const [key, value] of Object.entries(snapshot[KEYS.DRAWINGS] as Record<string, string> ?? {})) put('drawings', key.slice(documentId.length + 1), [{ canvas_data: value }]);
  for (const [key, value] of Object.entries(snapshot[KEYS.TEXT_NOTES] as Record<string, Row[]> ?? {})) put('text_notes', key.slice(documentId.length + 1), text(value));
  for (const [page, value] of Object.entries(snapshot[KEYS.PAGE_IMAGES] as Record<string, unknown[]> ?? {})) put('page_image_annotations', page, [{ images: value }]);
  if (Array.isArray(snapshot[KEYS.BLANK_PAGES])) put('blank_pages', '', blanks(snapshot[KEYS.BLANK_PAGES] as Row[]));
  if (Array.isArray(snapshot[KEYS.BOOKMARKS])) put('bookmarks', '', (snapshot[KEYS.BOOKMARKS] as Row[]).map(row => ({ ...row, virtual_index: row.virtualIndex ?? row.virtual_index, created_at: new Date(row.createdAt as number).toISOString() })));
  if (Array.isArray(snapshot[KEYS.KEY_TERMS])) put('key_terms', '', (snapshot[KEYS.KEY_TERMS] as Row[]).map(row => ({ ...row, created_at: new Date(row.createdAt as number).toISOString() })));
  for (const [kind, value] of Object.entries(snapshot)) {
    if (kind.startsWith('drawing:')) put('drawings', kind.slice(8), value ? [{ canvas_data: value }] : []);
    if (kind.startsWith('text_notes:')) put('text_notes', kind.slice(11), text(value as Row[]));
    if (kind.startsWith('page_images:')) put('page_image_annotations', kind.slice(12), [{ images: value }]);
    if (kind === 'blank_pages') put('blank_pages', '', blanks(value as Row[]));
  }
  // Acknowledged-order outbox payloads include all adapter-supported collections.

  const blankIds = new Map<string, string>();
  for (const row of payloads.get('blank_pages:')?.rows ?? []) if (typeof row.id === 'string') blankIds.set(row.id, crypto.randomUUID());
  return [...payloads.values()].map(payload => ({
    ...payload, pageKey: blankIds.get(payload.pageKey) ?? payload.pageKey,
    rows: payload.rows.map(row => {
      const { user_id: _owner, document_id: _document, document_generation: _generation, ...copy } = row;
      void _owner; void _document; void _generation;
      if ('id' in copy) copy.id = blankIds.get(String(copy.id)) ?? crypto.randomUUID();
      return copy;
    }),
  }));
}
export async function createDocumentRecoveryCopy(owner: string, originalId: string, name: string): Promise<{ id: string; file: File | null; incomplete: boolean }> {
  await assertDocumentOwner(owner);
  const source = await getStoredPdf(originalId, owner);
  if (!source) throw new Error('The source PDF is unavailable on this device. Export the recovery archive; no new document was created.');
  const payloads = recoveryPayloads(owner, originalId);
  const id = crypto.randomUUID();
  // Registration is explicit and enforces the same server quota as a new document.
  const generation = await registerDocument(owner, { id, name: `${name} (recovery)`, type: 'pdf' });
  let incomplete = false;
  for (const payload of payloads) {
    await assertDocumentOwner(owner);
    observeDocumentCollection({ ownerId: owner, documentId: id, generation, collection: payload.collection, pageKey: payload.pageKey }, 0);
    try { await writeDocumentCollection(payload.collection, id, payload.rows, payload.pageKey || null, owner); }
    catch { incomplete = true; } // New-ID outbox retains failed payloads; original remains intact.
  }
  await assertDocumentOwner(owner);
  const file = source ? new File([source.blob], `${name} (recovery).pdf`, { type: 'application/pdf' }) : null;
  if (file) await savePdfBlob(id, file, { filename: file.name, fingerprint: source?.fingerprint }, owner);
  await assertDocumentOwner(owner);
  return { id, file, incomplete };
}
