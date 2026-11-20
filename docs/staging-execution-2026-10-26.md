# Staging execution — 26 October 2026

## Environment and changes

Supabase MCP verified StudySync-Staging (`xokiiepdpjvqnpzwmbtb`) and production
Study_Sync (`mlyvadsznvyurjakovau`). Production was inspected read-only. No merge,
production migration, deployment or production backup was performed.

Staging already contained the first ten October migrations. It also contains
`free_launch_ai`, `free_launch_rooms`, and `free_launch_storage` (versions
20261007120000–20261007122000), which are absent from the repository. They impose
additional AI budgets, room limits and storage admission rules. Preserve them;
resolve this difference before treating staging as representative of production.
Production history currently ends at `20260811215355`, with none of these October
migrations installed.

Two staging migrations were applied:

| Repository version | Hosted version | Name |
| --- | --- | --- |
| 20261026100000 | 20261026214423 | preserve_referral_billing_entitlements |
| 20261026214817 | 20261026214832 | enforce_study_statistics_rls |

MCP assigns its own migration timestamp. Match names and SQL when reconciling
history; do not blindly replay the local timestamp as another missing migration.
The release hash manifest now includes twelve migrations.

The billing failure was reproduced before applying its correction: cancellation
removed an unexpired referral reward. The statistics failure was also reproduced:
an authenticated stranger could retrieve another user's study totals. The latter
functions ran as their privileged owner. The new migration uses caller privileges
and the existing ownership RLS, and removes anonymous execution grants. Function
signatures and the owner's aggregate results are preserved.

## Verified results

- `tests/staging/billing-quota.sql`: hosted PASS for canceled/unpaid/paused/
  incomplete-expired subscription entitlement loss with an active referral;
  subsequent referral expiry; duplicate/stale events; quota limit, idempotent
  refund/completion, expired-request recovery and privileged RPC grants.
- `tests/staging/study-statistics.sql`: hosted FAIL before the fix, PASS after;
  owner totals/streak/map remain accessible, stranger results contain no owner
  data, and anonymous execution is denied.
- `tests/staging/collections-rooms.sql`: hosted PASS for text-note ownership and
  server-controlled scope, preservation of prior notes after an invalid save,
  cross-user read/write isolation, duplicate leave and last-member room closure.
  This does not constitute browser acceptance of every collection or room audio.
- A separate concurrent quota check used two PostgreSQL backends (2198806 and
  2198808), one disposable user and a limit of one. One reservation succeeded,
  the other returned NULL; usage and reservation count were both one. Fixture
  removal was verified afterward.
- The referral-expiry Cron job is active every five minutes. Its three observed
  runs at 21:35, 21:40 and 21:45 UTC succeeded.
- All SQL scripts roll back their fixtures. A final query found zero users with
  this run's billing-check, release-check or release-quota email prefixes.
- `npm test`: 44 passed, zero failed. All twelve migration checksums pass.
- Chromium browser smoke against the local app configured for staging passed:
  unauthenticated `/workspace?doc=synthetic-check` navigates to login with the
  complete return destination; the email form renders without page errors.
  Browser shared libraries were extracted under `/tmp`, without system changes.
- Independent review found no high/medium issue in the statistics migration or
  hosted test scripts. Anonymous tests cover all three statistics RPCs.
- Post-change security advisors no longer list the three statistics functions.
  Other notices remain: six service-table RLS-without-policy notices, thirteen
  anonymous and seventeen authenticated security-definer execution findings.
  These need function-specific analysis; this is not a claim of a clean audit.

## Remaining release gates

Full authenticated browser/two-device/recording acceptance, LiveKit and Stripe
test-mode flows, staging-only migration reconciliation, and production backup/
restore verification remain incomplete. Vercel deployment settings and secrets
are not accessible through the currently connected tools. Supabase SQL access
does not supply a downloadable backup or a database export credential.

Do not merge this stack to main or apply production migrations until the release
plan's acceptance and recovery gates pass. Main automatically deploys to Vercel.
