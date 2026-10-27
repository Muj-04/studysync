# Reliability changes

## Workspace persistence

- `useTextNotes` owns text-note hydration and local/remote persistence.
- `supabase/annotations` serializes collection writes and uses one transactional RPC.
- `persistence/serialQueue` orders writes per resource, recovering after failures.
- `drawingHydration` prevents stale decoded images from overwriting another page or a new edit.
- `useBlankPages` commits a synchronous snapshot before React schedules rendering.
- Public imports from `supabase/db` remain compatible; PDFs remain in local IndexedDB.

### Deployment

Apply `20261004090000_atomic_study_collections.sql` before deploying the client.
The RPC is SECURITY INVOKER, retains existing RLS, verifies document ownership, and
rolls back an entire replacement when any insert fails. Do not fall back to the old
delete-then-insert path when the migration is missing. Old clients are unaffected by
adding the RPC and `blank_pages.images` column.

### Verification and limits

`npm test` runs source-level regressions and an in-memory Postgres fixture with RLS.
The fixture is not a substitute for staging against the complete live schema, which
is not checked into this repository. Verify all five collection saves in staging.
The hook harness models queued React state; it is not a browser end-to-end test.
Repository-wide lint has pre-existing failures and is not yet a passing CI gate.

### Remaining review work

Document identity/deletion, billing reconciliation, room ordering/reconnect, quota
and referral transactions, recording cleanup, and dependency upgrades require their
own focused changes. No production database changes are made by these PRs.
