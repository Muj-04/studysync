# Archived migrations (history only)

These 41 files are the migrations applied to production before 2026-11-28.
They are kept for history and for tests that exercise individual functions.

**Do not run them.** The core tables were created in the dashboard and never
had migrations, so these files cannot rebuild a database on their own. The
current schema is `supabase/migrations/20261128000000_baseline_schema.sql`,
which already includes everything these files did.
