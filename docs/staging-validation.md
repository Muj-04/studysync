# Hosted staging validation and subscription status compatibility

Stacked on PR #11. Do not release until the remaining operational gates below pass.

## Staging setup

- Created StudySync-Staging (xokiiepdpjvqnpzwmbtb), separate from Study_Sync production.
- Imported a schema-only snapshot of the actual production public schema: 48 tables,
  functions, indexes, grants, triggers, and RLS policies. No customer rows/files copied.
- Included the auth profile-creation trigger, 19 storage policies, nine realtime table
  subscriptions, and storage bucket configuration. Managed supabase_admin default ACLs
  are left to the new project's built-in defaults; postgres defaults are preserved.
- Applied the seven reviewed October migrations in order, then the compatibility
  migration in this PR. The resulting public schema has 51 tables.
- Schema snapshots, staging database credentials, and temporary test tooling stay outside
  git. Staging credentials are configured only in the isolated development worktree.
- Production was inspected read-only: no duplicate referred_id groups exist currently.
  Only a room-expiry cron job was found; referral expiry is not scheduled.

## Confirmed blocker and fix

The actual subscriptions table restricts status to active, canceled, past_due, and
trialing. apply_billing_event writes unpaid/paused/incomplete_expired as received from
Stripe. Hosted testing reproduced a constraint failure and transaction rollback.

20261007100000_subscription_status_compatibility.sql expands that check to the eight
Stripe subscription statuses. The regression fixture now starts with the production
constraint, demonstrates the unpaid failure before the migration, and verifies unpaid
and paused recovery afterward. Arbitrary invalid statuses remain rejected.

Apply this migration before releasing the billing route. It is additive with respect
to accepted data; old application code can run with it. Do not narrow the constraint
again unless rows using the new statuses have been reviewed first.

## Hosted checks completed

Using synthetic users that were removed after each run:

- Authenticated annotation RPC save; invalid replacement rolls back old notes.
- A second user cannot read or replace the first user's notes under actual RLS.
- Two independent PostgreSQL connections race for the final quota slot: one succeeds.
- An abandoned reservation expires, quota recovers before admission, and completed
  reservations cannot be refunded.
- Billing active -> unpaid -> active -> paused -> active -> canceled succeeds after
  the compatibility migration, through the service_role API function.
- Referral redemption succeeds once; repeat redemption is rejected.

These are hosted database tests, not Stripe-provider or browser acceptance tests.

## Remaining release gates

- Valid Stripe test credentials, real checkout/webhook/portal test-mode flows.
- Referral expiry scheduling and paid-subscription interaction need implementation
  and validation. Existing rewards currently have no scheduled expiry job.
- Two-browser room drawing/erasing/reconnect/leave and recording acceptance checks.
- Production backup, verified migration rollout, and post-deployment smoke test.

Vercel is configured to deploy main automatically. Do not merge this stack into main
until its required migrations and operational gates are addressed. No main merges or
production migrations have been performed.
