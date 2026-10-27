# Billing and session reliability

Stacked on PR #3. This PR is a draft until Stripe test-mode and staging checks pass.

## Changes

- Extract billing decisions and event handling into `src/lib/billing`.
- Apply profile/subscription updates and event deduplication in one service-only transaction.
- Reject failed writes so Stripe retries; ignore older events and terminal cancellation reversals.
- Retain the paid plan when an unpaid subscription later recovers.
- Reserve a durable checkout attempt per user and reuse its Stripe idempotency key.
- Reuse open checkout sessions and send existing subscribers to the billing portal.
- Session displacement signs out only the old device and honors free/VIP exceptions.

## Deployment and review gates

Apply both billing migrations before deploying routes. They are service-role only.
Enable/configure the Stripe customer portal. Current inline prices have portal plan-switch
limitations: cancellation/payment management must be tested, and plan changes require a
configured catalog and price-to-entitlement mapping before enabling portal plan updates.
Do not enable plan switching with the current metadata-only plan mapping.

Run Stripe test-mode flows: new checkout, concurrent/retried checkout, plan selection
change while checkout is open, delayed webhook, failed DB write/retry, renewal,
unpaid/recovery, cancellation, and existing-subscriber portal routing.
A reserved checkout expires after one hour; changing its plan is blocked while open.

13 automated tests pass; includes in-memory Postgres rollback, idempotency, stale-event
handling, role restrictions, checkout reservation reuse, and mocked Stripe routing.
No live Stripe charges, portal settings, subscriptions, or database records were changed.
These tests do not replace validation against the actual Supabase schema/Stripe account.
