'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BookOpen, Brain, CalendarClock, Check, ChevronLeft, ChevronRight,
  Clock3, FileText, Flame, Layers, MoreHorizontal, Plus, RotateCcw, Search,
  Shuffle, Sparkles, Trash2, X,
} from 'lucide-react';
import {
  createFlashcardDeck, deleteFlashcardDeck, fetchFlashcardDecks, fetchLibraryDocuments,
  getStudyStreak, loadDeckFlashcards, reviewFlashcard,
  type FlashcardDeck, type LibraryDocument, type StudyFlashcard,
} from '@/lib/supabase/db';
import { useAuthGuard } from '@/hooks/useAuthGuard';

const panel = {
  background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10,
} as const;

function formatRelative(iso: string | null): string {
  if (!iso) return 'Not studied yet';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Studied today';
  if (days === 1) return 'Studied yesterday';
  return `Studied ${days} days ago`;
}

function CreateDeckModal({ documents, onClose, onCreated }: {
  documents: LibraryDocument[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [docId, setDocId] = useState('');
  const [cards, setCards] = useState([{ question: '', answer: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const validCards = cards.filter((card) => card.question.trim() && card.answer.trim());

  const create = async () => {
    if (!name.trim()) { setError('Give your deck a name.'); return; }
    if (!validCards.length) { setError('Add at least one complete card.'); return; }
    setSaving(true); setError('');
    try {
      const id = await createFlashcardDeck({ name, description, docId: docId || null, cards: validCards });
      onCreated(id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the deck.'); }
    finally { setSaving(false); }
  };

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(2,6,23,.72)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ ...panel, width: 'min(620px, 100%)', maxHeight: '88vh', overflowY: 'auto', background: 'var(--bg-float)', boxShadow: 'var(--shadow-float)' }}>
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><h2 style={{ margin: 0, fontSize: 18 }}>Create a flashcard deck</h2><p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Start manually now. AI generation can be added from your PDFs next.</p></div>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, border: 0, borderRadius: 7, background: 'var(--bg-elevated)', color: 'var(--text-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 22 }}>
          <label style={labelStyle}>Deck name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Algorithms — Midterm" style={inputStyle} />
          <label style={labelStyle}>Description <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you studying?" style={inputStyle} />
          <label style={labelStyle}>Source document <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <select value={docId} onChange={(e) => setDocId(e.target.value)} style={inputStyle}>
            <option value="">No linked document</option>
            {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.name}</option>)}
          </select>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ ...labelStyle, margin: 0 }}>Cards</label>
            <button onClick={() => setCards((old) => [...old, { question: '', answer: '' }])} style={textButton}><Plus size={13} /> Add card</button>
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {cards.map((card, index) => (
              <div key={index} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'start' }}>
                <textarea value={card.question} onChange={(e) => setCards((old) => old.map((c, i) => i === index ? { ...c, question: e.target.value } : c))} placeholder="Question" rows={3} style={textareaStyle} />
                <textarea value={card.answer} onChange={(e) => setCards((old) => old.map((c, i) => i === index ? { ...c, answer: e.target.value } : c))} placeholder="Answer" rows={3} style={textareaStyle} />
                <button disabled={cards.length === 1} onClick={() => setCards((old) => old.filter((_, i) => i !== index))} aria-label="Remove card" style={{ width: 30, height: 30, border: 0, background: 'transparent', color: 'var(--text-3)', cursor: cards.length === 1 ? 'not-allowed' : 'pointer' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          {error && <p style={{ margin: '12px 0 0', color: 'var(--red)', fontSize: 12 }}>{error}</p>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={secondaryButton}>Cancel</button>
          <button onClick={create} disabled={saving} style={primaryButton}>{saving ? 'Creating…' : 'Create deck'}</button>
        </div>
      </div>
    </div>
  );
}

function StudyMode({ deck, onExit, onChanged }: { deck: FlashcardDeck; onExit: () => void; onChanged: () => void }) {
  const [cards, setCards] = useState<StudyFlashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);

  useEffect(() => { loadDeckFlashcards(deck.id).then((loaded) => { setCards(loaded); setLoading(false); }); }, [deck.id]);
  const card = cards[index];
  const next = useCallback(() => { setRevealed(false); setIndex((i) => cards.length ? (i + 1) % cards.length : 0); }, [cards.length]);
  const rate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!card || busy) return;
    setBusy(true);
    try { await reviewFlashcard(card, rating); setCompleted((n) => n + 1); next(); onChanged(); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); setRevealed((v) => !v); }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') { setRevealed(false); setIndex((i) => cards.length ? (i - 1 + cards.length) % cards.length : 0); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [cards.length, next]);

  return (
    <main style={{ minHeight: '100vh', padding: '26px 34px 40px', background: 'var(--bg-app)', color: 'var(--text-1)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button onClick={onExit} style={iconButton}><ArrowLeft size={17} /></button><div><h1 style={{ margin: 0, fontSize: 19 }}>{deck.name}</h1><p style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: 12 }}>{deck.docName ?? 'Personal deck'}</p></div></div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{cards.length ? `${index + 1} of ${cards.length}` : '0 cards'} · {completed} reviewed</div>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden', marginBottom: 38 }}><div style={{ width: `${cards.length ? ((index + 1) / cards.length) * 100 : 0}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} /></div>
        {loading ? <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 100 }}>Loading cards…</div> : !card ? (
          <div style={{ ...panel, padding: 60, textAlign: 'center' }}><Layers size={30} style={{ color: 'var(--text-3)', marginBottom: 12 }} /><h2>This deck has no cards</h2><button onClick={onExit} style={primaryButton}>Back to decks</button></div>
        ) : (
          <>
            <button onClick={() => setRevealed((v) => !v)} style={{ ...panel, width: '100%', minHeight: 390, padding: '54px 70px', color: 'var(--text-1)', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit', position: 'relative', boxShadow: '0 18px 50px rgba(0,0,0,.16)' }}>
              <span style={{ position: 'absolute', top: 20, left: 22, color: 'var(--accent)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em' }}>{revealed ? 'ANSWER' : 'QUESTION'}</span>
              <p style={{ margin: 0, fontSize: 25, lineHeight: 1.55, fontWeight: 600 }}>{revealed ? card.answer : card.question}</p>
              <span style={{ position: 'absolute', bottom: 20, left: 0, right: 0, color: 'var(--text-3)', fontSize: 11 }}>Click the card or press Space to {revealed ? 'show question' : 'reveal answer'}</span>
            </button>
            {revealed ? (
              <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {([['again','Again','5 min','#ef4444'],['hard','Hard','1 day','#f59e0b'],['good','Good','Later','#6366f1'],['easy','Easy','4+ days','#22c55e']] as const).map(([rating,label,time,color]) => <button key={rating} disabled={busy} onClick={() => rate(rating)} style={{ ...secondaryButton, height: 58, borderColor: `${color}66`, color, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', justifyContent: 'center' }}><strong>{label}</strong><span style={{ fontSize: 10, opacity: .8 }}>{time}</span></button>)}
              </div>
            ) : <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}><button onClick={() => setRevealed(true)} style={{ ...primaryButton, height: 44, padding: '0 28px' }}>Show answer</button></div>}
            <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}><button onClick={() => { setRevealed(false); setIndex((i) => (i - 1 + cards.length) % cards.length); }} style={iconButton}><ChevronLeft size={17} /></button><button onClick={() => setCards((old) => [...old].sort(() => Math.random() - .5))} style={iconButton} title="Shuffle"><Shuffle size={16} /></button><button onClick={next} style={iconButton}><ChevronRight size={17} /></button></div>
          </>
        )}
      </div>
    </main>
  );
}

export default function FlashcardsPage() {
  useAuthGuard();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'due' | 'mastered'>('all');
  const [creating, setCreating] = useState(false);
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [streak, setStreak] = useState(0);
  const load = useCallback(async () => { const [d, docs, s] = await Promise.all([fetchFlashcardDecks(), fetchLibraryDocuments(), getStudyStreak()]); setDecks(d); setDocuments(docs); setStreak(s); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);
  const shown = useMemo(() => decks.filter((deck) => {
    const matches = deck.name.toLowerCase().includes(query.toLowerCase()) || (deck.docName ?? '').toLowerCase().includes(query.toLowerCase());
    if (!matches) return false;
    if (filter === 'due') return deck.dueCount > 0;
    if (filter === 'mastered') return deck.cardCount > 0 && deck.masteredCount === deck.cardCount;
    return true;
  }), [decks, query, filter]);
  const totals = decks.reduce((a, deck) => ({ cards: a.cards + deck.cardCount, due: a.due + deck.dueCount, mastered: a.mastered + deck.masteredCount }), { cards: 0, due: 0, mastered: 0 });

  if (activeDeck) return <StudyMode deck={activeDeck} onExit={() => setActiveDeck(null)} onChanged={load} />;
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-1)', padding: '30px 34px 60px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, marginBottom: 28 }}><div><h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-.02em' }}>Flashcards</h1><p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>Build stronger memory with focused, spaced review.</p></div><button onClick={() => setCreating(true)} style={{ ...primaryButton, height: 38 }}><Plus size={15} /> Create deck</button></header>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          <Stat icon={<CalendarClock size={18} />} label="Due today" value={totals.due} color="#f59e0b" />
          <Stat icon={<Layers size={18} />} label="Total cards" value={totals.cards} color="var(--accent)" />
          <Stat icon={<Brain size={18} />} label="Mastered" value={totals.mastered} color="#22c55e" />
          <Stat icon={<Flame size={18} />} label="Day streak" value={streak} color="#f97316" />
        </section>
        {decks.length > 0 && <section style={{ ...panel, padding: 20, marginBottom: 26, display: 'flex', alignItems: 'center', gap: 18 }}><div style={{ width: 42, height: 42, borderRadius: 9, background: 'var(--accent-muted)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}><RotateCcw size={19} /></div><div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700 }}>Continue studying</p><h2 style={{ margin: '5px 0 0', fontSize: 15 }}>{decks[0].name}</h2></div><span style={{ fontSize: 12, color: 'var(--text-3)' }}>{decks[0].dueCount} due</span><button onClick={() => setActiveDeck(decks[0])} style={primaryButton}>Continue</button></section>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}><div><h2 style={{ margin: 0, fontSize: 16 }}>My decks</h2><p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-3)' }}>{decks.length} deck{decks.length === 1 ? '' : 's'}</p></div><div style={{ display: 'flex', gap: 8 }}><div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-3)' }} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decks…" style={{ ...inputStyle, width: 220, height: 34, paddingLeft: 32, margin: 0 }} /></div>{(['all','due','mastered'] as const).map((key) => <button key={key} onClick={() => setFilter(key)} style={{ ...secondaryButton, height: 34, color: filter === key ? 'var(--accent)' : 'var(--text-2)', background: filter === key ? 'var(--accent-muted)' : 'var(--bg-panel)' }}>{key === 'all' ? 'All' : key === 'due' ? 'Due today' : 'Mastered'}</button>)}</div></div>
        {loading ? <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-3)' }}>Loading your decks…</div> : decks.length === 0 ? <EmptyState onCreate={() => setCreating(true)} /> : shown.length === 0 ? <div style={{ ...panel, padding: 50, textAlign: 'center', color: 'var(--text-3)' }}>No decks match this view.</div> : <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>{shown.map((deck) => <DeckCard key={deck.id} deck={deck} onStudy={() => setActiveDeck(deck)} onDelete={async () => { if (!window.confirm(`Delete “${deck.name}” and all its cards?`)) return; await deleteFlashcardDeck(deck.id); load(); }} />)}</section>}
      </div>
      {creating && <CreateDeckModal documents={documents} onClose={() => setCreating(false)} onCreated={async (id) => { setCreating(false); await load(); const cards = await fetchFlashcardDecks(); const deck = cards.find((d) => d.id === id); if (deck) setActiveDeck(deck); }} />}
    </main>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) { return <div style={{ ...panel, padding: '16px 17px', display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-elevated)', color, display: 'grid', placeItems: 'center' }}>{icon}</div><div><strong style={{ display: 'block', fontSize: 20 }}>{value}</strong><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</span></div></div>; }
function EmptyState({ onCreate }: { onCreate: () => void }) { return <div style={{ ...panel, padding: '72px 24px', textAlign: 'center' }}><div style={{ width: 58, height: 58, borderRadius: 14, background: 'var(--accent-muted)', color: 'var(--accent)', display: 'grid', placeItems: 'center', margin: '0 auto 17px' }}><Layers size={25} /></div><h2 style={{ margin: 0, fontSize: 18 }}>Create your first flashcard deck</h2><p style={{ margin: '9px auto 20px', maxWidth: 390, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>Turn the ideas you are studying into questions, then review them at the right time.</p><button onClick={onCreate} style={primaryButton}><Plus size={15} /> Create manually</button></div>; }
function DeckCard({ deck, onStudy, onDelete }: { deck: FlashcardDeck; onStudy: () => void; onDelete: () => void }) { const progress = deck.cardCount ? Math.round((deck.masteredCount / deck.cardCount) * 100) : 0; return <article style={{ ...panel, padding: 18, minHeight: 210, display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--accent-muted)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}><BookOpen size={18} /></div><button onClick={onDelete} title="Delete deck" style={{ ...iconButton, width: 30, height: 30 }}><Trash2 size={13} /></button></div><h3 style={{ margin: '15px 0 5px', fontSize: 15 }}>{deck.name}</h3><p style={{ margin: 0, color: 'var(--text-3)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.docName ? <><FileText size={11} style={{ verticalAlign: -2, marginRight: 5 }} />{deck.docName}</> : deck.description || 'Personal deck'}</p><div style={{ marginTop: 16, height: 4, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)' }} /></div><div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', color: 'var(--text-3)', fontSize: 10.5 }}><span>{deck.cardCount} cards · {deck.dueCount} due</span><span>{progress}% mastered</span></div><div style={{ marginTop: 'auto', paddingTop: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-3)', fontSize: 10.5 }}><Clock3 size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{formatRelative(deck.lastStudiedAt)}</span><button onClick={onStudy} style={{ ...primaryButton, height: 32, padding: '0 14px' }}>Study</button></div></article>; }

const labelStyle: React.CSSProperties = { display: 'block', margin: '14px 0 7px', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.03em' };
const inputStyle: React.CSSProperties = { width: '100%', height: 38, boxSizing: 'border-box', padding: '0 11px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', fontSize: 12.5 };
const textareaStyle: React.CSSProperties = { ...inputStyle, height: 'auto', padding: 9, resize: 'vertical', lineHeight: 1.45 };
const primaryButton: React.CSSProperties = { height: 36, padding: '0 17px', border: 0, borderRadius: 7, background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { height: 36, padding: '0 15px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-elevated)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const iconButton: React.CSSProperties = { width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-elevated)', color: 'var(--text-2)', display: 'inline-grid', placeItems: 'center', cursor: 'pointer' };
const textButton: React.CSSProperties = { border: 0, background: 'transparent', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' };
