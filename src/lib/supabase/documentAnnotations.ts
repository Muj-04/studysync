import { sb, userId } from './dbShared';
import { readDocumentCollection, writeDocumentCollection } from './documentCollections';
import type { TextNote, Bookmark, KeyTerm, BlankPage, PDFPageImage } from '@/types';

// ── Text Notes ───────────────────────────────────────────────────────────────

export async function fetchTextNotes(docId: string): Promise<Record<string, TextNote[]>> {
  const uid = await userId();
  console.log('[DB] fetchTextNotes uid:', uid, 'docId:', docId);
  if (!uid) throw new Error('Sign in to load text notes');
  const data = await readDocumentCollection('text_notes', docId);
  console.log('[DB] fetchTextNotes rows:', data?.length ?? 0);
  const map: Record<string, TextNote[]> = {};
  for (const r of data ?? []) {
    const cat = r.category as string | null | undefined;
    const note: TextNote = {
      id: String(r.id), x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height),
      content: String(r.content), fontSize: Number(r.font_size), color: String(r.color),
      ...(cat === 'important' || cat === 'review' || cat === 'idea'
        ? { category: cat as TextNote['category'] }
        : {}),
    };
    (map[String(r.page_key)] ??= []).push(note);
  }
  return map;
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function fetchBookmarks(docId?: string): Promise<Bookmark[]> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to load bookmarks');
  if (docId) {
    const rows = await readDocumentCollection('bookmarks', docId);
    return rows.map(r => ({ id: String(r.id), documentId: String(r.document_id), virtualIndex: Number(r.virtual_index), label: String(r.label), createdAt: new Date(String(r.created_at)).getTime() }));
  }
  let q = sb().from('bookmarks').select('*').eq('user_id', uid);
  if (docId) q = q.eq('document_id', docId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load bookmarks: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, virtualIndex: r.virtual_index,
    label: r.label, createdAt: new Date(r.created_at).getTime(),
  }));
}

// ── Key Terms ────────────────────────────────────────────────────────────────

export async function fetchKeyTerms(docId: string): Promise<KeyTerm[]> {
  const uid = await userId(); if (!uid) return [];
  const data = await readDocumentCollection('key_terms', docId);
  return (data ?? []).map((r) => ({
    id: String(r.id), documentId: String(r.document_id), term: String(r.term),
    definition: String(r.definition), createdAt: new Date(String(r.created_at)).getTime(),
  }));
}

// ── Drawings ─────────────────────────────────────────────────────────────────

async function saveDrawingNow(docId: string, pageKey: string, canvasData: string | null, expectedOwner?: string) {
  return writeDocumentCollection('drawings', docId, canvasData ? [{ canvas_data: canvasData }] : [], pageKey, expectedOwner);
}

async function deleteAllDrawingsNow(docId: string): Promise<void> {
  const drawings = await readDocumentCollection('drawings', docId);
  for (const row of drawings) await writeDocumentCollection('drawings', docId, [], String(row.page_key));
}

export async function fetchDrawings(docId: string): Promise<Record<string, string>> {
  const uid = await userId();
  console.log('[DB] fetchDrawings uid:', uid, 'docId:', docId);
  if (!uid) return {};
  const data = await readDocumentCollection('drawings', docId);
  const map: Record<string, string> = {};
  for (const r of data ?? []) if (r.canvas_data) map[String(r.page_key)] = String(r.canvas_data);
  return map;
}

// ── Blank Pages ───────────────────────────────────────────────────────────────

export async function fetchBlankPages(docId: string): Promise<BlankPage[]> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to load blank pages');
  const data = await readDocumentCollection('blank_pages', docId);
  return (data ?? []).map((r) => ({
    id: String(r.id), documentId: String(r.document_id), insertAfterPage: Number(r.insert_after_page),
    images: (r.images ?? []) as BlankPage['images'], canvasData: r.canvas_data as string | undefined, bgTheme: r.bg_theme as 'white' | 'dark', createdAt: Number(r.created_at),
  }));
}

// ── Page Image Annotations ────────────────────────────────────────────────────

async function savePageImagesNow(docId: string, pageNumber: number, images: PDFPageImage[], expectedOwner?: string): Promise<void> {
  return writeDocumentCollection('page_image_annotations', docId, [{ images }], String(pageNumber), expectedOwner);
}

export async function fetchAllPageImages(docId: string): Promise<Record<number, PDFPageImage[]>> {
  const data = await readDocumentCollection('page_image_annotations', docId);
  const map: Record<number, PDFPageImage[]> = {};
  for (const row of data) map[Number(row.page_number)] = row.images as PDFPageImage[];
  return map;
}

// ── User storage stats & bulk operations ─────────────────────────────────────


/** Share the document lifetime with collection writes and deletion. */
export function saveDrawing(...args: Parameters<typeof saveDrawingNow>): ReturnType<typeof saveDrawingNow> {
  return saveDrawingNow(...args);
}

/** Share the document lifetime with collection writes and deletion. */
export function savePageImages(...args: Parameters<typeof savePageImagesNow>): ReturnType<typeof savePageImagesNow> {
  return savePageImagesNow(...args);
}

/** Clearing must follow earlier strokes in the same document queue. */
export function deleteAllDrawings(docId: string): Promise<void> {
  return deleteAllDrawingsNow(docId);
}
