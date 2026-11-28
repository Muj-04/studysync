-- Migration: add optional `category` column to text_notes so the
-- Notes tab can render categorized note cards (IMPORTANT / TO REVIEW
-- / IDEA) per the Figma design.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP/RE-ADD on the CHECK so
-- this can be re-run safely if you need to tweak the allowed values
-- later.
--
-- Old rows: existing notes keep category = NULL and render as a
-- neutral 'uncategorized' card in the UI. No backfill needed.

ALTER TABLE public.text_notes
  ADD COLUMN IF NOT EXISTS category text;

-- Drop the constraint first (if a prior version exists) to make the
-- migration safely re-runnable with different allowed values.
ALTER TABLE public.text_notes
  DROP CONSTRAINT IF EXISTS text_notes_category_check;

ALTER TABLE public.text_notes
  ADD CONSTRAINT text_notes_category_check
  CHECK (category IS NULL OR category IN ('important', 'review', 'idea'));

COMMENT ON COLUMN public.text_notes.category IS
  'Optional Figma-aligned note category. NULL = uncategorized.';
