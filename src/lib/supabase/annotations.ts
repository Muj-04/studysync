import { writeDocumentCollection } from './documentCollections';
import type { TextNote, Bookmark, KeyTerm, BlankPage } from '@/types';

export function saveTextNotes(docId: string, pageKey: string, notes: TextNote[], expectedOwner?: string) {
  return writeDocumentCollection('text_notes', docId, notes.map((n) => ({
    id: n.id, x: n.x, y: n.y, width: n.width, height: n.height,
    content: n.content, font_size: n.fontSize, color: n.color, category: n.category ?? null,
  })), pageKey, expectedOwner);
}

export function saveBookmarks(docId: string, bookmarks: Bookmark[], expectedOwner?: string) {
  return writeDocumentCollection('bookmarks', docId, bookmarks.map((b) => ({
    id: b.id, virtual_index: b.virtualIndex, label: b.label, created_at: new Date(b.createdAt).toISOString(),
  })), null, expectedOwner);
}

export function saveKeyTerms(docId: string, terms: KeyTerm[], expectedOwner?: string) {
  return writeDocumentCollection('key_terms', docId, terms.map((t) => ({
    id: t.id, term: t.term, definition: t.definition, created_at: new Date(t.createdAt).toISOString(),
  })), null, expectedOwner);
}

export function saveBlankPages(docId: string, pages: BlankPage[], expectedOwner?: string) {
  return writeDocumentCollection('blank_pages', docId, pages.map((p) => ({
    id: p.id, insert_after_page: p.insertAfterPage, canvas_data: p.canvasData ?? null,
    images: p.images ?? [], bg_theme: p.bgTheme ?? 'white', created_at: p.createdAt,
  })), null, expectedOwner);
}

export function saveFlashcards(docId: string, pageNum: number, cards: { question: string; answer: string }[], expectedOwner?: string) {
  return writeDocumentCollection('flashcards', docId, cards.map((c) => ({
    question: c.question, answer: c.answer,
  })), String(pageNum), expectedOwner);
}
