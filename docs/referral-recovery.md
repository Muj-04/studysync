# Pending referral recovery

The former client helper ignored HTTP results and swallowed network failures.
Login and callback removed the pending code after any resolved call, including
HTTP503. The real callback regression reproduces that lost intent before the fix.

Recovery now binds the pending code to the first authenticated account before
sending. A different account cannot redeem that retained intent. Opening a new
registration referral link creates a new intent and resets its account binding.
Owner-scoped durable records survive sign-out; ordinary caches and unbound URL staging intent still clear. Another account’s newly selected code does not overwrite the first account’s durable record. A newly selected link supersedes only the account that explicitly claims it.

Each sign-in, authenticated app mount, online event, or auth-session event can
trigger at most two redemption requests. Each request has a two-second deadline
covering session lookup, fetch and JSON decoding; an entire recovery invocation
has a five-second limit. There is no polling or render-triggered retry. Optional
own-code initialization has the same two-second request bound. The authenticated
app does not await recovery. Login/callback continue after failed recovery.

| Response | Action |
| --- | --- |
| Explicit `ok: true` | Clear the matching pending intent |
| `already_referred` | Treat as confirmed completion; clear the matching intent |
| Network failure, timeout, HTTP408/425/429/5xx, malformed success | Retry once, then retain for a later trigger |
| HTTP401/403 | Retain for a refreshed/authenticated session; no immediate retry |
| `email_unverified`, `referrer_too_new`, `monthly_cap` | Retain for a later trigger; no immediate retry |
| `no_referrer_or_self`, `ip_conflict`, other non-success HTTP status | Retain with a terminal marker; no automatic retry until a new referral intent replaces it |

Requests use the captured account's bearer token and omit cookies. This prevents
an invalid old bearer from falling back to a different account's newer cookie
session. Session identity and the stored intent are checked before retry and
cleanup; unmount/account-change cancellation aborts outstanding work. A late
response cannot clear a newer code or advance recovery after cancellation. Superseded referral work returns a deferred outcome so successful sign-in still navigates.

The existing `redeem_referral` RPC locks both profiles in deterministic order,
enforces one redemption per referred account, and grants rewards transactionally.
A committed request whose response is lost can therefore retry and receive
`already_referred` without granting another reward. No RPC/schema change is made.

Tests exercise real helpers, actual login/callback handlers, authenticated
mount/online recovery, timeout/cancellation/account-switch behavior, and the
existing local SQL idempotency/rollback test. They are controlled local evidence,
not fresh hosted authentication or reward acceptance. No hosted data is changed.
