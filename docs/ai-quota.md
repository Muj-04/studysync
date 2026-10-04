# Atomic AI quota

Stacked on PR #5. Apply `20261004120000_reserve_ai_quota.sql` before deployment.

The API now reserves a monthly request atomically before contacting Anthropic. Requests
that lose the last-slot race receive HTTP 429. Model/request failures refund the reservation
at most once. Invalid input does not consume quota. Helpers live in `src/lib/aiQuota.ts`.

18 tests and TypeScript pass, including Postgres last-slot/refund/role tests.
The in-memory database serializes connections, so a staging test with independent
concurrent connections is still required. Reservations are retained for accounting;
plan a retention job before high-volume usage. Process termination after reservation
can consume a request without completing it; automatic crash reconciliation is not added.
No live AI calls or database migrations were performed.
