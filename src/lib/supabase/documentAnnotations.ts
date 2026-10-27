import { enqueueDocumentWrite } from '@/lib/persistence/documentQueue';
import { sb, userId, ensureDoc } from './dbShared';
import type { TextNote, Bookmark, KeyTerm, BlankPage, PDFPageImage } from '@/types';

// ── Text Notes ───────────────────────────────────────────────────────────────

export async function fetchTextNotes(docId: string): Promise<Record<string, TextNote[]>> {
  const uid = await userId();
  console.log('[DB] fetchTextNotes uid:', uid, 'docId:', docId);
  if (!uid) return {};
  const { data, error } = await sb().from('text_notes').select('*').match({ user_id: uid, document_id: docId });
  console.log('[DB] fetchTextNotes rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  const map: Record<string, TextNote[]> = {};
  for (const r of data ?? []) {
    const cat = r.category as string | null | undefined;
    const note: TextNote = {
      id: r.id, x: r.x, y: r.y, width: r.width, height: r.height,
      content: r.content, fontSize: r.font_size, color: r.color,
      ...(cat === 'important' || cat === 'review' || cat === 'idea'
        ? { category: cat as TextNote['category'] }
        : {}),
    };
    (map[r.page_key] ??= []).push(note);
  }
  return map;
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function fetchBookmarks(docId?: string): Promise<Bookmark[]> {
  const uid = await userId(); if (!uid) return [];
  let q = sb().from('bookmarks').select('*').eq('user_id', uid);
  if (docId) q = q.eq('document_id', docId);
  const { data } = await q.order('created_at', { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, virtualIndex: r.virtual_index,
    label: r.label, createdAt: new Date(r.created_at).getTime(),
  }));
}

// ── Key Terms ────────────────────────────────────────────────────────────────

export async function fetchKeyTerms(docId: string): Promise<KeyTerm[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('key_terms').select('*').match({ user_id: uid, document_id: docId });
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, term: r.term,
    definition: r.definition, createdAt: new Date(r.created_at).getTime(),
  }));
}

// ── Drawings ─────────────────────────────────────────────────────────────────

async function saveDrawingNow(docId: string, pageKey: string, canvasData: string | null) {
  const uid = await userId(); if (!uid) return;
  await ensureDoc(uid, docId);
  if (!canvasData) {
    await sb().from('drawings').delete().match({ user_id: uid, document_id: docId, page_key: pageKey });
    return;
  }
  const { error } = await sb().from('drawings').upsert({
    id: `${uid}_${docId}_${pageKey}`,
    user_id: uid, document_id: docId, page_key: pageKey,
    canvas_data: canvasData, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,document_id,page_key' });
  if (error) console.error('[DB] saveDrawing error:', error.message, 'docId:', docId, 'pageKey:', pageKey);
  else console.log('[DB] saveDrawing OK — docId:', docId, 'pageKey:', pageKey);
}

export async function deleteAllDrawings(docId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb().from('drawings').delete().match({ user_id: uid, document_id: docId });
  if (error) console.error('[DB] deleteAllDrawings error:', error.message);
  else console.log('[DB] deleteAllDrawings OK — docId:', docId);
}

export async function fetchDrawings(docId: string): Promise<Record<string, string>> {
  const uid = await userId();
  console.log('[DB] fetchDrawings uid:', uid, 'docId:', docId);
  if (!uid) return {};
  const { data, error } = await sb().from('drawings').select('page_key, canvas_data').match({ user_id: uid, document_id: docId });
  console.log('[DB] fetchDrawings rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  const map: Record<string, string> = {};
  for (const r of data ?? []) if (r.canvas_data) map[r.page_key] = r.canvas_data;
  return map;
}

// ── Blank Pages ───────────────────────────────────────────────────────────────

export async function fetchBlankPages(docId: string): Promise<BlankPage[]> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to load blank pages');
  const { data, error } = await sb().from('blank_pages').select('*').match({ user_id: uid, document_id: docId });
  if (error) throw new Error(`Could not load blank pages: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, insertAfterPage: r.insert_after_page,
    images: r.images ?? [], canvasData: r.canvas_data, bgTheme: r.bg_theme as 'white' | 'dark', createdAt: r.created_at,
  }));
}

// ── Page Image Annotations ────────────────────────────────────────────────────

async function savePageImagesNow(docId: string, pageNumber: number, images: PDFPageImage[]): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await ensureDoc(uid, docId);
  const { error } = await sb().from('page_image_annotations').upsert(
    { user_id: uid, document_id: docId, page_number: pageNumber, images: images as unknown as object[], updated_at: new Date().toISOString() },
    { onConflict: 'user_id,document_id,page_number' },
  );
  if (error) console.error('[DB] savePageImages error:', error.message, 'docId:', docId, 'page:', pageNumber);
}

export async function fetchAllPageImages(docId: string): Promise<Record<number, PDFPageImage[]>> {
  const uid = await userId(); if (!uid) return {};
  const { data, error } = await sb()
    .from('page_image_annotations')
    .select('page_number, images')
    .match({ user_id: uid, document_id: docId });
  if (error) { console.error('[DB] fetchAllPageImages error:', error.message); return {}; }
  const map: Record<number, PDFPageImage[]> = {};
  for (const r of data ?? []) map[r.page_number] = r.images as PDFPageImage[];
  return map;
}

// ── User storage stats & bulk operations ─────────────────────────────────────


/** Share the document lifetime with collection writes and deletion. */
export function saveDrawing(...args: Parameters<typeof saveDrawingNow>): ReturnType<typeof saveDrawingNow> {
  return enqueueDocumentWrite(args[0], () => saveDrawingNow(...args));
}

/** Share the document lifetime with collection writes and deletion. */
export function savePageImages(...args: Parameters<typeof savePageImagesNow>): ReturnType<typeof savePageImagesNow> {
  return enqueueDocumentWrite(args[0], () => savePageImagesNow(...args));
}
