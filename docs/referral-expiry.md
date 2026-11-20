# Scheduled referral reward expiry

Stacked on PR #12. Production inspection found no referral-expiry job: only the
room-expiry job existed. Reward timestamps alone did not revoke granted Premium access.

## Implementation

- Service-only expire_referral_rewards() processes at most 500 expired profiles per call
  with row locks and SKIP LOCKED; repeated execution is harmless.
- Only expired Premium access with no active/trialing/past_due paid subscription becomes
  Free. Pro and VIP access are preserved; active future rewards are untouched.
- Clear processed referral expiry timestamps, including those of paid/VIP accounts.
- A separate migration enables Supabase Cron if needed and schedules the named job
  every five minutes. No HTTP endpoints or application credentials are involved.

## Verification

- 28 regression tests pass across the stack. The added fixture covers expired rewards,
  paid active/trialing/past_due access, Pro, VIP, unexpired/null expiry, canceled
  subscriptions, idempotency, and authenticated-role denial.
- Hosted staging test verifies expired reward access becomes Free while an active paid
  subscription remains Premium under the actual production profile trigger/schema.
- Staging cron.job_run_details confirms the scheduled job ran successfully.
- Browser login and local PDF render/reload/identity checks passed against staging.

## Rollout and operational notes

Apply 20261007110000_expire_referral_rewards.sql, then
20261007111000_schedule_referral_expiry.sql after the prior migrations. Production has
not been changed. The new migrations and tests need independent review before release.

Rewards may remain active until the next five-minute run; monitor cron failures and
expired-profile backlog (500 per run). A subscription in past_due retains access,
consistent with the existing billing policy. This job does not grant new paid access
or repair historical billing/profile inconsistencies.

To stop future runs, use cron.unschedule('studysync-expire-referral-rewards'). Already
expired rewards are not restored automatically by rollback; use an audited backup if
restoration is required. Do not broadly grant Premium to all former referrals.

Stripe provider checkout/webhook/portal validation still requires valid test keys.
No production merges, migrations, or scheduled-job changes were performed.
