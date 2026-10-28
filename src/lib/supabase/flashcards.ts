import { requireDocumentGeneration, assertDocumentOwner } from './documentProtocol';
import { readDocumentCollection } from './documentCollections';
import { sb, userId } from './dbShared';

// ── Flashcards ────────────────────────────────────────────────────────────────

export interface Flashcard {
  id: string;
  docId: string;
  pageNum: number;
  question: string;
  answer: string;
  createdAt: string;
}

export async function loadFlashcards(docId: string, pageNum: number): Promise<Flashcard[]> {
  const uid = await userId(); if (!uid) return [];
  const rows = await readDocumentCollection('flashcards', docId);
  const data = rows.filter(row => Number(row.page_num) === pageNum);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    docId: String(r.doc_id),
    pageNum: Number(r.page_num),
    question: String(r.question),
    answer: String(r.answer),
    createdAt: String(r.created_at),
  }));
}

export interface FlashcardDeck {
  id: string;
  name: string;
  description: string;
  docId: string | null;
  docName: string | null;
  createdAt: string;
  updatedAt: string;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
  lastStudiedAt: string | null;
}

export interface StudyFlashcard extends Flashcard {
  deckId: string;
  nextReviewAt: string;
  intervalDays: number;
  reviewCount: number;
  lastReviewedAt: string | null;
}

export async function fetchFlashcardDecks(): Promise<FlashcardDeck[]> {
  const uid = await userId(); if (!uid) return [];
  const [{ data: decks, error }, { data: cards }, { data: docs }] = await Promise.all([
    sb().from('flashcard_decks').select('id, name, description, doc_id, created_at, updated_at').eq('user_id', uid).order('updated_at', { ascending: false }),
    sb().from('flashcards').select('deck_id, next_review_at, interval_days, last_reviewed_at').eq('user_id', uid).not('deck_id', 'is', null),
    sb().from('documents').select('id, name').eq('user_id', uid),
  ]);
  if (error) { console.error('[DB] fetchFlashcardDecks error:', error.message); return []; }
  const now = Date.now();
  const docNames = new Map((docs ?? []).map((d) => [d.id, d.name]));
  return (decks ?? []).map((deck) => {
    const deckCards = (cards ?? []).filter((card) => card.deck_id === deck.id);
    const reviewed = deckCards.filter((card) => card.last_reviewed_at).map((card) => card.last_reviewed_at as string).sort().at(-1) ?? null;
    return {
      id: deck.id,
      name: deck.name,
      description: deck.description,
      docId: deck.doc_id,
      docName: deck.doc_id ? (docNames.get(deck.doc_id) ?? null) : null,
      createdAt: deck.created_at,
      updatedAt: deck.updated_at,
      cardCount: deckCards.length,
      dueCount: deckCards.filter((card) => new Date(card.next_review_at).getTime() <= now).length,
      masteredCount: deckCards.filter((card) => card.interval_days >= 21).length,
      lastStudiedAt: reviewed,
    };
  });
}

export async function createFlashcardDeck(input: {
  name: string;
  description?: string;
  docId?: string | null;
  cards: Array<{ question: string; answer: string }>;
}): Promise<string> {
  const uid = await userId(); if (!uid) throw new Error('You must be signed in.');
  const document_generation = input.docId ? await requireDocumentGeneration(uid, input.docId) : null;
  await assertDocumentOwner(uid);
  const { data: id, error } = await sb().rpc('create_flashcard_deck_v2', {
    p_name: input.name.trim(), p_description: input.description?.trim() ?? '',
    p_document_id: input.docId || null, p_generation: document_generation,
    p_cards: input.cards.filter(card => card.question.trim() && card.answer.trim()).map(card => ({ question: card.question.trim(), answer: card.answer.trim() })),
  });
  if (error || typeof id !== 'string') throw new Error(error?.message ?? 'Could not create deck.');
  await assertDocumentOwner(uid);
  return id;
}

export async function loadDeckFlashcards(deckId: string): Promise<StudyFlashcard[]> {
  const uid = await userId(); if (!uid) return [];
  const { data, error } = await sb().from('flashcards')
    .select('id, deck_id, doc_id, page_num, question, answer, created_at, next_review_at, interval_days, review_count, last_reviewed_at')
    .eq('user_id', uid).eq('deck_id', deckId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((card) => ({
    id: card.id, deckId: card.deck_id, docId: card.doc_id, pageNum: card.page_num,
    question: card.question, answer: card.answer, createdAt: card.created_at,
    nextReviewAt: card.next_review_at, intervalDays: card.interval_days,
    reviewCount: card.review_count, lastReviewedAt: card.last_reviewed_at,
  }));
}

export async function reviewFlashcard(card: StudyFlashcard, rating: 'again' | 'hard' | 'good' | 'easy'): Promise<StudyFlashcard> {
  const uid = await userId(); if (!uid) throw new Error('You must be signed in.');
  await assertDocumentOwner(uid);
  const { data: saved, error } = await sb().rpc('review_flashcard_v2', {
    p_card_id: card.id, p_expected_review_count: card.reviewCount, p_rating: rating,
  });
  if (error) throw new Error(error.message);
  if (!saved) throw new Error('Could not save your review. The card may no longer be available.');
  await assertDocumentOwner(uid);
  // The review is already committed. A secondary deck timestamp failure must
  // not make the caller retry using the old card schedule.
  try {
    const { error: deckError } = await sb().from('flashcard_decks').update({ updated_at: saved.last_reviewed_at }).eq('id', card.deckId).eq('user_id', uid);
    if (deckError) console.warn('[Flashcards] deck timestamp update failed:', deckError.message);
  } catch (error) {
    console.warn('[Flashcards] deck timestamp update failed:', error);
  }
  return { ...card, intervalDays: saved.interval_days, reviewCount: saved.review_count,
    lastReviewedAt: saved.last_reviewed_at, nextReviewAt: saved.next_review_at };
}

export async function deleteFlashcardDeck(deckId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb().from('flashcard_decks').delete().eq('id', deckId).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

