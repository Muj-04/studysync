# Referral transactions

Stacked on PR #7. Draft pending staging validation of the existing referral schema.

## Changes

- One service-only transaction verifies email, referrer age, one redemption per user,
  monthly cap, optional trusted IP conflict, and both seven-day rewards.
- Lock both profiles in ID order to serialize limits and reward stacking.
- Preserve Pro/VIP tiers and roll back the referral row when either reward fails.
- Reject untrusted body-supplied IPs. Vercel's edge-provided `x-forwarded-for` is used
  only when VERCEL=1; other hosting needs an explicit trusted-proxy adapter.
  Reference: https://vercel.com/docs/headers/request-headers
- Route now handles auth/input/response; reward rules live in a versioned SQL function.

## Verification / deployment

20 regression tests pass across the stack, including referral duplicate prevention,
Pro preservation, reward rollback and role restrictions. TypeScript passes.
Apply the migration before deploying the route. If old duplicate referred_id rows exist,
the unique index intentionally fails: inspect and resolve those records without silently
deleting historical data. No live schema or account records were changed.

Referral reward expiry scheduling remains unverified because the complete production
schema and scheduled jobs are not in the repository. Verify expiry without downgrading
paid subscriptions or VIP accounts before enabling wider referral promotion.
