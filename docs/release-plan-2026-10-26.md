# Reviewed stack release plan — 26 October 2026

**Goal:** Validate the complete #2–#14 stack in staging, verify a recoverable
production backup, and release the complete tested revision in a single deployment.

**Scope:** User authorized staging migrations, acceptance testing, production backup
and release preparation. Production migration/deployment remains conditional on
successful validation. Specifications: `staging-validation.md` and
`pr-stack-review-2026-10-26.md`.

## Current evidence and access

- Tested application revision: `47d84a0d2f2697df3dadb1842d2fa9836d98f09d`.
- 44 local regressions, TypeScript, production build, GitHub CI and Vercel preview
  passed. Full and production dependency audits reported zero vulnerabilities.
- Supabase MCP is connected. Verified staging `xokiiepdpjvqnpzwmbtb` and production
  `mlyvadsznvyurjakovau`; inspected histories, relevant functions and RLS.
- Staging had the first ten October migrations plus three free-launch migrations
  absent from git. Applied the referral/billing correction and a newly reproduced
  study-statistics authorization fix to staging. See the execution report below.
- Vercel, Stripe test credentials, LiveKit credentials and a verified production
  backup/database export connection remain unavailable.
- Cloudflare was uninstalled by the owner. The old failed check remains historical;
  do not delete or falsify its result.
- **Not completed:** full hosted browser/provider acceptance, production backup/
  restore verification, production migrations, merge to main or deployment.

## 1. Establish the environment and migration baseline

- [ ] Connect Supabase and Vercel; identify production by account/project metadata,
  not by a guessed URL or by the preview's existing environment variables.
- [ ] Confirm staging project identity and inspect migration history, table schemas,
  function definitions, grants/RLS, auth profile trigger, publications, Storage
  policies/buckets and Cron. Prior reports say ten October migrations were applied;
  verify this rather than replaying all ten.
- [ ] Verify that the staging app targets only staging Supabase and test-mode Stripe,
  with staging callback URLs, webhook secret and LiveKit room configuration.
- [ ] Compare local hashes with `release-migrations-2026-10-26.sha256` using
  `sha256sum -c docs/release-migrations-2026-10-26.sha256` from the repository root.
- [ ] Apply only verified missing October migrations in manifest order, stopping on
  the first error. Inspect drift or missing dependencies before proceeding. Do not
  run a blind full `db push`: historical migrations mix filename conventions and the
  complete original production schema is not in git.
- [ ] Confirm the new referral/billing function and service-role-only grants, status
  constraint, atomic collection functions, AI reservation recovery and named Cron job.

Read-only discovery SQL (run only after confirming project identity):

```sql
SELECT current_database(), current_user, version();
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history,
       to_regclass('public.billing_events') AS billing_events,
       to_regclass('public.ai_request_reservations') AS quota_reservations,
       to_regclass('cron.job') AS cron_jobs;
SELECT proname, pg_get_function_identity_arguments(oid), prosecdef,
       proacl, pg_get_functiondef(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('replace_study_collection', 'apply_billing_event',
                  'reserve_checkout_attempt', 'leave_room_atomic',
                  'reserve_ai_request', 'reserve_ai_request_v2',
                  'refund_ai_request', 'complete_ai_request',
                  'reconcile_ai_requests', 'redeem_referral',
                  'expire_referral_rewards');
```

A null discovery result is a finding; verify migration history before making changes.

## 2. Hosted acceptance using disposable staging accounts

- [ ] Create two isolated synthetic users and a generated sample PDF. Record created
  IDs privately for cleanup; do not copy production customer rows into staging.
- [ ] Verify all atomic annotation collections, ownership isolation and rollback of
  invalid replacement. Confirm personal PDF bytes stay local and IDs/notes survive
  reload; mismatched reopen bytes are rejected.
- [ ] Verify two-device stale note hydration never writes over cloud data, offline
  note edits retry, document deletion clears pending writes, and drawing during
  bitmap restoration cannot remove previous strokes.
- [ ] Test two-user chat, simultaneous views, reopening, pagination/read receipts,
  and switching conversations while success/failure of a send is delayed.
- [ ] Test two-browser room draw/erase, offline/reconnect recovery, join/leave races
  and last-member closure. Record and save audio; verify tracks stop on navigation.
  Synthetic audio coverage and physical-device microphone/playback are separate.
- [ ] Test LiveKit token ownership, two-way join/audio, mute/unmute and teardown in
  an isolated staging room. Obtain physical-device confirmation where needed.
- [ ] Use independent database connections to test quota last-slot admission,
  completion/refund retries and expired pending-request recovery.
- [ ] Test referral single redemption, reward rollback, paid/VIP/Pro preservation,
  unpaid/paused/canceled billing with unexpired reward, subsequent expiry and a
  successful scheduled Cron invocation.
- [ ] Connect Stripe in test mode. Complete real checkout, concurrent retry,
  delayed/retried signed webhook, failed-write recovery, renewal, unpaid/recovery,
  cancellation and existing-subscriber portal flows. Verify every event has
  `livemode=false`; never create real charges for acceptance testing.
- [ ] Keep portal plan changes disabled until a price catalog and trusted price-to-
  entitlement mapping are implemented and validated; current checkout uses inline
  prices. Cancellation/payment management still needs provider acceptance.
- [ ] Remove synthetic accounts, subscriptions, room data, files and test webhooks
  created by this run. Save sanitized results with revision and environment identity.

## 3. Production backup and recovery evidence

- [ ] Verify the production project's latest recoverable backup/PITR and retention.
  Capture its timestamp and recovery instructions privately before changing schema.
- [ ] Store any downloaded backups outside git with restricted permissions. Verify
  checksums and restore into an isolated target; file existence alone is insufficient.
- [ ] Inventory auth/profile triggers, Storage policies, migration history, scheduled
  jobs, publications and project configuration in addition to public table data.
- [ ] Back up Storage objects separately: a database dump is not a backup of the
  room PDF/audio object bytes. Personal device-local PDFs are not server backups.
- [ ] If logical exports are used, follow the official CLI backup procedure for roles,
  schema, data and migration history. Coordinate a consistent snapshot/write pause
  where needed; independent dumps during writes are not one consistent recovery point.

Reference: [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
and [database backups](https://supabase.com/docs/guides/platform/backups).
No backup command has been executed yet; access is required.

## 4. Single-batch rollout and rollback

- [ ] Record the current production deployment ID, git revision, migration baseline
  and verified recovery point. Rerun required checks on the exact release revision.
- [ ] Consolidate the complete tested stack into one reviewed change targeting main.
  Do not merge #2 into main first and deploy earlier intermediate revisions: known
  defects are repaired by later PRs in the stack. Preserve the existing PR history.
- [ ] Apply only verified missing production migrations in the same tested order
  after backup verification and the staging gates pass. Confirm the referral Cron
  schedule and check for errors/backlog. Stop on failures before application rollout.
- [ ] Merge/deploy the single tested batch. Vercel auto-deploys main; no intermediate
  main commits containing partial stack changes should be released.
- [ ] Smoke-test sign-in, PDF/notes, chat, room lifecycle and billing entitlement,
  then inspect logs for migration/RPC/RLS/Stripe errors and verify Cron runs.
- [ ] If rollout fails, restore the previous application deployment while retaining
  additive compatible schema. Stop the referral Cron job if it is the failure source.
  Do not bulk refund quota, bulk grant Premium or drop ledgers to simulate rollback.
  Data restoration needs the verified backup and reconciliation of writes/events
  since that recovery point, including Stripe events and Storage objects.

## Execution record

Current results are recorded in [staging execution report](staging-execution-2026-10-26.md).
The subsequent seven-area review and additional fixes are recorded in
[follow-up audit](followup-audit-2026-10-26.md), including the unresolved product
limits choice and provider/backup access gaps.
The checklist above remains conservative: a partially tested item is not complete.
