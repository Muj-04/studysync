# AI quota recovery and refreshed dependency audit

Stacked on PR #10. Addresses the two remaining code/dependency review findings.

## Changes

- Refunds and completion retry three idempotent RPC attempts; exhausted errors throw.
- V2 reservations are persisted as pending with a five-minute expiry. A successful
  provider response must complete its reservation before the route returns success.
- Every V2 quota admission reconciles the user's expired pending reservations first.
  Therefore failed refunds and killed server processes do not permanently consume quota.
- Reconciliation is transactional, bounded to 500 records per call, and service-only.
  Completed reservations are never automatically refunded. Repeated refunds are safe.
- Provider calls have a 60-second timeout and no SDK retries; the route advertises a
  120-second execution budget. Both fit within the five-minute database lease.
- The only lockfile dependency change is source-map-js 1.2.1 -> 1.2.2.
  Advisory: https://github.com/advisories/GHSA-68fv-2mgg-jv7q
- The reviewer retracted the earlier session-exemption finding; no session code changed.

## Migration, operation, and rollback

1. Apply all earlier migrations, then 20261007090000_ai_quota_recovery.sql in staging.
2. Deploy this application version after the migration. The old reserve RPC remains
   available, and existing/old-client reservations are marked legacy. They are not
   expired automatically, because the old application never marked successful requests.
3. Verify provider failure + refund outage + expiry + next request recovery, and test
   final-slot admission/refund/completion races using independent database connections.
4. Optionally schedule `SELECT public.reconcile_ai_requests();` every minute using a
   trusted database scheduler. This is not needed for next-request recovery, but keeps
   idle users' displayed usage current. No schedule was installed by this PR.
   Calls process at most 500 records; monitor oldest pending expiry and repeat if needed.
5. Application rollback can retain this additive schema and use the legacy reserve RPC.
   Run reconciliation for outstanding V2 requests after their expiry if rolling back.
   Do not drop the ledger or subtract completed/legacy usage wholesale.

## Limits

- Exhausted refund attempts leave usage temporarily charged until expiry and the next
  request or trusted sweep. A database outage must recover before reconciliation works.
- Historical legacy reservations cannot be automatically classified as failed/successful;
  any historical corrections require provider logs and a scoped administrative review.
- Database completion and delivery of the HTTP response cannot be one transaction. A
  response lost after successful completion may remain charged; retries here prevent
  duplicate settlement, not end-to-end HTTP delivery ambiguity.
- Ledger retention remains an operational follow-up. Five development-only dependency
  findings remain outside this targeted production patch.

## Verification

27 regression tests pass, including actual PostgreSQL function execution in PGlite,
rollback/retry after an injected usage-update failure, expiry recovery at the quota limit,
legacy/completed preservation, denied authenticated-role RPC access, and route settlement.
Independent concurrent connections and production schema/RLS still need staging checks.
Production audit on October 7 reports zero vulnerabilities after the targeted update.
No live migrations, scheduled jobs, merges, or production configuration changes performed.
