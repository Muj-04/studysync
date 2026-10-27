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
  const { data, error } = await sb()
    .from('flashcards')
    .select('id, doc_id, page_num, question, answer, created_at')
    .eq('user_id', uid)
    .eq('doc_id', docId)
    .eq('page_num', pageNum)
    .order('created_at', { ascending: true });
  if (error) { console.error('[DB] loadFlashcards error:', error.message); return []; }
  return (data ?? []).map((r) => ({
    id: r.id,
    docId: r.doc_id,
    pageNum: r.page_num,
    question: r.question,
    answer: r.answer,
    createdAt: r.created_at,
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
  const { data: deck, error } = await sb().from('flashcard_decks').insert({
    user_id: uid,
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    doc_id: input.docId || null,
  }).select('id').single();
  if (error || !deck) throw new Error(error?.message ?? 'Could not create deck.');
  const cards = input.cards.filter((card) => card.question.trim() && card.answer.trim());
  if (cards.length) {
    const { error: cardError } = await sb().from('flashcards').insert(cards.map((card) => ({
      user_id: uid,
      deck_id: deck.id,
      doc_id: input.docId || `deck:${deck.id}`,
      page_num: 0,
      question: card.question.trim(),
      answer: card.answer.trim(),
    })));
    if (cardError) {
      await sb().from('flashcard_decks').delete().eq('id', deck.id).eq('user_id', uid);
      throw new Error(cardError.message);
    }
  }
  return deck.id;
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

export async function reviewFlashcard(card: StudyFlashcard, rating: 'again' | 'hard' | 'good' | 'easy'): Promise<void> {
  const uid = await userId(); if (!uid) throw new Error('You must be signed in.');
  const now = new Date();
  let interval = card.intervalDays;
  if (rating === 'again') interval = 0;
  if (rating === 'hard') interval = Math.max(1, Math.round(Math.max(interval, 1) * 1.2));
  if (rating === 'good') interval = interval === 0 ? 1 : Math.max(2, Math.round(interval * 2));
  if (rating === 'easy') interval = interval === 0 ? 4 : Math.max(4, Math.round(interval * 3));
  const next = new Date(now);
  if (rating === 'again') next.setMinutes(next.getMinutes() + 5);
  else next.setDate(next.getDate() + interval);
  const { error } = await sb().from('flashcards').update({
    interval_days: interval,
    review_count: card.reviewCount + 1,
    last_reviewed_at: now.toISOString(),
    next_review_at: next.toISOString(),
  }).eq('id', card.id).eq('user_id', uid);
  if (error) throw new Error(error.message);
  await sb().from('flashcard_decks').update({ updated_at: now.toISOString() }).eq('id', card.deckId).eq('user_id', uid);
}

export async function deleteFlashcardDeck(deckId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb().from('flashcard_decks').delete().eq('id', deckId).eq('user_id', uid);
  if (error) throw new Error(error.message);
}

