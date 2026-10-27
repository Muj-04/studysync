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

## Serialized provider reconciliation (27 October 2026)

The new `20261027140326_serialize_billing_reconciliation.sql` migration and webhook
must be released together in an isolated test environment first. The migration
revokes the old snapshot writer from `service_role`; old deployments fail and Stripe
retries instead of applying stale snapshots. It has not been applied to production.

Every supported subscription or checkout event claims a database lease **before**
retrieving the subscription from Stripe. Other requests for that subscription fail
retryably. The commit checks the lease token and expiry under a row lock, so a slow
worker cannot overwrite a newer result after its lease expires. Entitlements and the
event receipt commit in one transaction. Event timestamps are audit data, not an
ordering authority: equal-second events and payment recovery both use current
provider state. A failed provider read or commit does not record the event.

The handler supports subscription created/updated/deleted/paused/resumed plus checkout
completion. Configure these event types on the test webhook destination. Checkout
already writes `subscription_data.metadata`; reconciliation now uses that metadata
for updates arriving before checkout completion. Legacy checkout metadata is a
fallback only when authoritative metadata is absent, with customer/owner checks.
`incomplete` grants no paid access; the existing past-due grace policy remains.
Referral rewards remain effective independently of subscription entitlement.

Canceled subscriptions are retrieved just like other subscriptions. A 404, timeout,
or provider failure returns a retryable webhook error; it neither trusts the event
snapshot nor invents a cancellation. Investigate persistent missing-resource errors
in the correct Stripe account/mode. Legacy subscriptions missing their creation time are reconciled automatically
under a separate lease before retrying and rereading the replacement; ambiguous same-second
creation of *different* subscriptions requires operator reconciliation. Older replaced
subscriptions cannot overwrite the current subscription. This is distinct from
same-second events for one subscription, which are fully reconciled.

Local PGlite and mocked-provider regressions cover timestamp ties, recovery with an
older event, duplicate delivery, contention before fetch, expired-worker fencing,
missing-resource retries, canceled retrieval, checkout metadata fallback, and RPC
permissions. They do not prove Stripe test-mode acceptance. The hosted staging database suite
`tests/staging/billing-reconciliation.sql` also passed on 27 October; it checks
lease fencing sequentially, not a two-connection race.
Required hosted tests remain: paused then stale active delivery, recovery, concurrent
workers including lease expiry, checkout/update reordering, missing subscription,
DB failure and redelivery, referral preservation, and replacement subscriptions.
A Stripe-side change after a read still requires its subsequent webhook/retry to
converge; no database protocol can atomically lock Stripe state.

References: [Stripe event ordering and duplicate delivery](https://docs.stripe.com/webhooks),
[subscription retrieval](https://docs.stripe.com/api/subscriptions/retrieve), and
[Supabase RPC](https://supabase.com/docs/reference/javascript/rpc).
