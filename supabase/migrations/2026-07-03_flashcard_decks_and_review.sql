create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  doc_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flashcard_decks enable row level security;

create policy "Users manage own flashcard decks"
  on public.flashcard_decks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.flashcards
  add column if not exists deck_id uuid references public.flashcard_decks(id) on delete cascade,
  add column if not exists next_review_at timestamptz not null default now(),
  add column if not exists interval_days integer not null default 0 check (interval_days >= 0),
  add column if not exists review_count integer not null default 0 check (review_count >= 0),
  add column if not exists last_reviewed_at timestamptz;

create index if not exists flashcard_decks_user_updated_idx
  on public.flashcard_decks(user_id, updated_at desc);

create index if not exists flashcards_deck_review_idx
  on public.flashcards(deck_id, next_review_at);

