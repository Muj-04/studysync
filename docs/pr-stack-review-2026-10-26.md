# PR stack review — 26 October 2026

Reviewed all 13 open PRs, #2–#14, against their bases and as the combined
`fix/realtime-room-lifecycle` stack. Follow-up fixes live on PR #14 so the existing
branches and review history remain intact. Earlier PRs must not be released in
isolation: they depend on fixes and migrations further up the stack.

## Findings fixed in this review

- **P1, #2 persistence:** mounting `useTextNotes` uploaded every cached page before
  cloud hydration. Opening an older device could replace newer cloud notes without
  an edit. Treat restored snapshots as clean and seed fetched pages without saving.
  Persist only pending edits in a per-user outbox, retry current local snapshots on
  remount, and clear deleted documents from the outbox in Library and workspace.
- **P2, #2 drawing hydration:** beginning a stroke while the saved bitmap decoded
  invalidated the decode after the canvas was cleared. A new save could discard
  previous strokes. Refuse drawing edits until the current decode finishes.
- **P2, #4/#8/#13 entitlements:** canceled, unpaid, and paused billing events
  removed unexpired referral rewards. An additive migration preserves the reward
  on the profile while recording the subscription's own free entitlement. The
  existing expiry job removes reward access at expiry.
- **P2, #9 messaging:** millisecond-only sorting reordered PostgreSQL microsecond
  timestamps by UUID, selecting the wrong older-history cursor. Preserve the
  remaining fractional precision, including timezone-offset timestamps.
- **P2, #9/#14 chat lifecycle:** conversation reopening reused a subscribed cached
  channel during asynchronous teardown; concurrent conversation views also shared
  channel ownership. Give each effect its own channel, remove it on disposal, ignore
  stale callbacks, and avoid resubscribing when only the read callback changes.
  Also invalidate pending sends when changing conversations: a delayed result must
  not insert the previous friend's message or restore their draft in the new chat.
- **P2, #9 navigation:** authentication redirects discarded the requested protected
  route. Preserve the pathname and query through the validated login return path.
- **Security, #7/#11:** the previous zero-audit result was no longer current.
  Upgrade Next.js and its ESLint config to 16.4.3, Sentry to 10.76.2, DOMPurify to
  3.4.17, and refresh affected transitive dependencies without a forced major upgrade.
  Full and production-only audits now report zero vulnerabilities.

## Review coverage

| PR | Areas checked | Result at combined head |
| --- | --- | --- |
| #2 | Atomic collection writes, local hydration, drawing, blank pages | Persistence and drawing fixes above; transactional rollback/ownership tests retained |
| #3 | PDF byte/account identity, IndexedDB, deletion, room isolation | Earlier explicit-reopen fix in #10 retained; pending-note deletion now included |
| #4 | Checkout reservation, webhook ordering/rollback, device sessions | Referral entitlement interaction fixed; provider acceptance gate remains |
| #5 | Room departure locks, stroke reconciliation, microphone cleanup, study sessions | Regression coverage retained; no further confirmed issue in changed logic |
| #6 | Atomic quota admission, refund idempotency and service-only functions | Later recovery in #11 retained; quota tests pass |
| #7 | PDF.js loading/cleanup/worker, Node engine, dependency audit | Current security updates applied; matching-worker test retained |
| #8 | Referral locks, limits, duplicate redemption, reward rollback and roles | Billing interaction fixed; later scheduled expiry retained |
| #9 | Query pagination/read receipts, safe navigation, origin policy, exports | Message ordering, chat lifecycle and login redirects fixed |
| #10 | Parent document registration, retry, PDF reopen byte validation | Existing fixes retained and regression-tested |
| #11 | Pending quota leases, completion/refund retries, recovery/role boundaries | Existing fixes retained and regression-tested; audit refreshed |
| #12 | Stripe status compatibility with production constraint | Compatibility migration and rollback/recovery tests retained |
| #13 | Scheduled reward expiry, paid/Pro/VIP preservation | Added billing interaction regression through subsequent reward expiry |
| #14 | Realtime generations, channel disposal, membership ordering, notifications | Same disposal principles applied to direct-message views |

## Verification and release boundaries

Regression coverage includes SQL executed in PGlite, rollback and role checks,
hook lifecycle tests, actual Supabase channel-cache behavior without network
access, PDF worker equality, account/file identity, navigation, and message queries.
The production build uses placeholder public Supabase settings; it does not verify
authenticated provider flows. TypeScript and production build pass locally.
Final `npm test`: 44 tests passed, zero failures. PR #10's previously canceled
GitHub validation was restarted and passed.

Repository-wide ESLint remains a separate failing gate: the unchanged head has 69
errors with the upgraded lint dependencies (React-hook/ref, legacy typing,
generated-worker and test-loader findings). Focused lint passes for the changed
hooks, libraries, proxy, chat component and tests. Existing workspace and drawing
component findings remain; rules were not disabled to obtain a green result.

Apply `20261026100000_preserve_referral_billing_entitlements.sql` after all earlier
stack migrations, in staging first. No production schema, cron, secret, account,
main-branch or deployment changes were made by this review.

Remaining external release gates:

- Real Stripe test-mode checkout, webhook, recovery and portal acceptance with
  configured credentials and catalog; these were not available locally.
- LiveKit acceptance with configured staging credentials.
- Cloudflare Pages reports a failed preview build and links logs accessible only
  through its account dashboard. GitHub's check output does not include the build
  error. Do not claim that integration is repaired without those logs/access.
- Back up production, verify all migrations against staging, and perform an
  authenticated post-deployment smoke test before releasing the stack. Earlier PR
  descriptions record past staging results; this review did not rerun hosted tests.

## Security references

- [Next.js typed-array cache advisory](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr)
- [Sentry tunnel middleware advisory](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55)
- [DOMPurify 3.4.17 release](https://github.com/cure53/DOMPurify/releases/tag/3.4.17)

Audit severity alone does not demonstrate exploitability in this application;
patched packages remove the reported vulnerable versions from the dependency tree.
