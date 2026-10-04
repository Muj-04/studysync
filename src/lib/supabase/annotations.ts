import { createClient } from './client';
import { createSerialQueue } from '@/lib/persistence/serialQueue';
import type { TextNote, Bookmark, KeyTerm, BlankPage } from '@/types';

const enqueue = createSerialQueue();
type Collection = 'text_notes' | 'bookmarks' | 'key_terms' | 'blank_pages' | 'flashcards';

/** A single RPC transaction replaces a collection; failures never delete old rows. */
function replace(collection: Collection, docId: string, rows: object[], pageKey: string | null = null) {
  // Queue before authentication so slower auth responses cannot reorder edits.
  return enqueue(`${collection}:${docId}:${pageKey ?? ''}`, async () => {
    const client = createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) throw new Error('Sign in to sync study data');
    const { error } = await client.rpc('replace_study_collection', {
      p_collection: collection, p_document_id: docId, p_page_key: pageKey, p_rows: rows,
    });
    if (error) throw new Error(`Could not save ${collection}: ${error.message}`);
  });
}

export function saveTextNotes(docId: string, pageKey: string, notes: TextNote[]) {
  return replace('text_notes', docId, notes.map((n) => ({
    id: n.id, x: n.x, y: n.y, width: n.width, height: n.height,
    content: n.content, font_size: n.fontSize, color: n.color, category: n.category ?? null,
  })), pageKey);
}

export function saveBookmarks(docId: string, bookmarks: Bookmark[]) {
  return replace('bookmarks', docId, bookmarks.map((b) => ({
    id: b.id, virtual_index: b.virtualIndex, label: b.label, created_at: new Date(b.createdAt).toISOString(),
  })));
}

export function saveKeyTerms(docId: string, terms: KeyTerm[]) {
  return replace('key_terms', docId, terms.map((t) => ({
    id: t.id, term: t.term, definition: t.definition, created_at: new Date(t.createdAt).toISOString(),
  })));
}

export function saveBlankPages(docId: string, pages: BlankPage[]) {
  return replace('blank_pages', docId, pages.map((p) => ({
    id: p.id, insert_after_page: p.insertAfterPage, canvas_data: p.canvasData ?? null,
    images: p.images ?? [], bg_theme: p.bgTheme ?? 'white', created_at: p.createdAt,
  })));
}

export function saveFlashcards(docId: string, pageNum: number, cards: { question: string; answer: string }[]) {
  return replace('flashcards', docId, cards.map((c) => ({
    question: c.question, answer: c.answer,
  })), String(pageNum));
}
