# Development integration QA — 27 October 2026

User requested review of every open PR, corrections, and integration into `dev`.
All 13 open PRs (#2–#14) form one stack. `dev` did not exist at the start;
create it from the unchanged `main`, and merge the complete reviewed stack there.
This review does not authorize or certify a production release.

## Scope and disposition

| PR | Review scope | Development disposition |
| --- | --- | --- |
| #2 | Annotation collections, hydration, persistence | Integrate with deletion queue correction in stack tip |
| #3 | PDF identity, deletion, local/room isolation | Integrate with deletion queue correction in stack tip |
| #4 | Billing transactions, checkout, device sessions | Integrate; real provider acceptance and equal-second event reconciliation remain release gates |
| #5 | Room writes/departure, microphone lifecycle | Integrate with later realtime/voice corrections |
| #6 | Atomic monthly AI admission/refunds | Integrate with recovery in #11 |
| #7 | PDF.js worker and dependencies | Integrate with patched dependency versions in #14 |
| #8 | Transactional referrals | Integrate with billing-preservation/expiry fixes in later stack |
| #9 | Messages, navigation, exports | Integrate with later precision and channel-ownership fixes |
| #10 | Parent registration, explicit PDF reopen | Integrate with deletion queue correction |
| #11 | Quota lease recovery and dependency correction | Integrate |
| #12 | Hosted subscription status compatibility | Integrate; production migration still required |
| #13 | Referral expiry and Cron | Integrate; production rollout still gated |
| #14 | Combined review fixes, auth protections, reset navigation | Integrate after final checks |

Independent reviewers inspected persistence/documents/rooms, backend/SQL/billing,
and auth/navigation/CAPTCHA. Prior review findings and hosted evidence were read,
not represented as new hosted tests. The latest auth-focused review passed 33 tests.

## New confirmed defect

Queued annotation saves could re-register a document after deletion: saves call
`ensureDocument` when they execute, while deletion did not coordinate with the
save queue. A deterministic reproduction ended with the deleted document existing
again. The correction serializes deletion against all five queued collections, rejects
stale queued writes, and allows explicit successful reopen to restore writing.
A deletion generation prevents an older registration from clearing a newer
deletion barrier. Three new regression tests cover these interactions; this is
same-process coordination, not a cross-device deletion protocol.

## Unresolved findings and release boundaries

- Billing events carry second-resolution ordering. An active event arriving after
  a paused event with the same timestamp can restore paid entitlement from stale
  data. Reproduced against the combined SQL in PGlite. The original main webhook
  also applied arrival order; the stack improves older-event handling but does not
  solve equal-second ordering. Do not invent a status ranking or discard every tie:
  either can reject legitimate payment recovery. Serialized reconciliation against
  authoritative provider state and real Stripe test-mode acceptance remain needed.
- Repository-wide lint has 63 errors and 50 warnings, matching the previously
  documented baseline. They are not hidden or declared passing. Focused checks are
  used for corrections in this review.
- Staging-only free-launch limits differ from the plan-based app. Product-policy
  reconciliation remains outstanding; do not blindly replay staging into production.
- Stripe/LiveKit hosted acceptance, real recovery/CAPTCHA enforcement, recoverable
  production backup, and production migrations remain unverified release gates.
- The Vercel dashboard evidence shows many provider variables shared between
  Production and Preview. A preview deployment is not proof of backend isolation;
  no load test, real charge, or live data migration is authorized by dev integration.

## Review mechanics

GitHub is authenticated as Muj-04, who authored these PRs. GitHub does not permit
self-approval. Record QA review comments rather than claiming a formal independent
GitHub approval. Merge the stack in reverse dependency order into its parent
branches, with the bottom PR retargeted to `dev`; this preserves each PR's merge
record and brings the complete correction set into dev together. Leave main and
production schema unchanged. Enable the existing CI workflow on pushes to dev.

## Final local validation

- 81/81 regression tests passed, including three new deletion regressions.
- TypeScript passed without incremental caching.
- Production build passed with staging public configuration and required Turnstile.
- Scoped ESLint for the changed persistence files passed; full lint baseline remains as above.
- All 13 migration manifest checksums passed.
- npm dependency audit reported zero vulnerabilities.
- Git diff whitespace check passed.

The development integration is accepted with the explicit release gates above;
this is not an all-clear for production.
