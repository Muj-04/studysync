# Dev readiness follow-up — 27 October 2026

> Current status: PRs #15–#20 are merged into dev and the combined Preview is deployed. See [the staging release checklist](staging-release-checklist.md) for current evidence and Auth configuration blockers. The details below record the earlier audit state.

## Completed

- Dev integration revision `9fafae5` passed GitHub CI and Vercel deployment.
- Repaired all 63 ESLint errors without blanket rule suppression. Current full lint:
  zero errors, 31 warnings. CI now runs lint in addition to tests and TypeScript.
- Fixed browser hydration/preferences, stale friend-search/outline/bookmark results,
  document-scoped page/zoom state, commit-phase refs, and voice player cleanup.
- Voice-note restoration now initializes its external store outside render and gates
  persistence until ready, preventing the initial empty render from erasing stored
  recordings. Offline restore and mutation tests pass.
- Billing uses current Stripe subscription data under a durable database lease,
  fenced commit and transactional receipt. It handles same-second events, delayed
  fetches, retries, cancellations, and legacy subscription replacement. It fails
  safely on missing provider data or ambiguous equal-second *subscription creation*.
- Added preview build validation: staging Supabase URL required, live Stripe keys
  rejected, and legacy service-role JWT project refs checked. Opaque key ownership
  and LiveKit isolation still require operator configuration; this is not a runtime
  firewall and does not change an already-deployed preview.

## Validation

- 88 local regression tests passed; TypeScript and production build passed.
- Preview-mode build passed with the actual staging public URL/key and required
  Turnstile site key. This does not prove a solved challenge or server enforcement.
- Five hosted staging suites passed: collections/room lifecycle; historical
  billing/quota; statistics ownership; search privacy; current billing reconciliation.
  Each suite rolled back its fixtures. Lease contention testing is sequential, not
  an independent two-connection timing test.
- The new billing migration passed in a rollback transaction, then was applied to
  staging only as hosted version `20261027141735`, name
  `serialize_billing_reconciliation`. Local version is `20261027140326`; reconcile
  by name and SQL content, not a blind timestamp replay. It is now in the 14-entry
  release checksum manifest. The hosted suite passed again after application.
- Staging security advisor: seven service tables intentionally have RLS/no ordinary
  user policy; existing 10 anon and 14 authenticated definer findings remain as
  previously reviewed. New lease RPCs deny anon/authenticated execution.
- Chromium against a local app and the real staging backend passed saved-email
  hydration, real password sign-in, and authenticated Library/Friends/Flashcards/
  Settings rendering without page exceptions. CAPTCHA was disabled in this local
  smoke; it did not test real challenge enforcement or email recovery.
- Local referral-code API returned 500 because the staging service-role key is not
  configured. The smoke is not a complete end-to-end provider test. The synthetic
  account was deleted; a cleanup query confirmed zero remaining readiness accounts.

## Access and remaining work

Vercel is not authenticated in this terminal (no saved CLI login/token or connected
Vercel tool). The Vercel API request timed out after eight seconds (HTTP 000).
An asynchronous request asked the owner to run `npx vercel login`; no response was
available during this work. Existing preview variables were shown sharing production
provider credentials. The follow-up is on a separate branch until isolation is set.

Configure **Preview**, preferably dev-specific overrides, before merging/deploying:

| Setting | Required value/source |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | https://xokiiepdpjvqnpzwmbtb.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Staging publishable/anon key |
| SUPABASE_SERVICE_ROLE_KEY | Staging secret/service-role key, privately in Vercel |
| STRIPE_SECRET_KEY / publishable key / webhook secret | One isolated Stripe test-mode integration |
| LIVEKIT_URL / API key / secret | Isolated test project |
| NEXT_PUBLIC_APP_URL | Actual dev deployment URL |
| Turnstile public site key | Widget allowing the actual dev hostname |

The Turnstile secret belongs in **staging Supabase Auth**, not a NEXT_PUBLIC value.
Configure exact dev auth callback/recovery redirect URLs and verify both missing-token
rejection and successful challenges before enabling production enforcement. No secret
keys were added to this repository or requested in chat.

Still incomplete: full two-user PDF/notes/chat/rooms and real microphone acceptance,
email recovery, hosted CAPTCHA enforcement, real Stripe checkout/webhook/portal,
LiveKit tests, and independent concurrent-provider tests. The existing free-launch
limits on staging still conflict with plan-based UI and need a product decision.

Production backup/PITR metadata, export credentials, Storage backups, and an isolated
restore target are unavailable here. No backup was created or restore claimed.
Production migration history remains latest `20260811215355`; no production database,
secret, main-branch, or release changes were made. Keep main unchanged until backup,
provider tests, policy reconciliation and release gates pass. The new billing migration
revokes the old service writer, so coordinate application and migration rollout and
expect old webhook attempts to retry during the cutover; do not deploy it alone.
