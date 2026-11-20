# Staging compatibility corrections — 2026-11-07

This captures the earlier compatibility round. The later
[Storage policy review](2026-11-07-storage-policy-review.md) supersedes the policy
gaps and final revisions below.

No hosted migrations, configuration changes, merges or production changes were
performed. Staging facts below were supplied by the owner from read-only SQL
Editor results; the connector still returned Unknown tool. Raw catalog exports
remain outside Git. Stripe acceptance remains deferred.

## Confirmed evidence and fixes

- All 14 discovered document-linked columns are reviewed, with zero invalid
  references and full row visibility. study_sessions.document_id alone violated
  its approved detach policy by being NOT NULL. #40 d101711 makes that reference
  nullable inside the generation migration and preserves the history row when
  the document is deleted. No existing history is deleted or rewritten.
- Both recording IDs are TEXT with no default. Tables and bucket were empty in
  the supplied snapshot. #41 3d30fab locks both tables through migration commit
  and converts only empty TEXT-ID tables to UUID. Populated TEXT tables abort;
  UUID legacy paths remain supported. Unsupported dependencies abort the same
  transaction rather than being dropped or rewritten automatically.
- Bucket is private, versioning DISABLED, max size 10 MiB. Revised admission
  respects its size/MIME limits before creating work, while retaining the 100 MiB
  application ceiling. Existing uploaded-operation retries remain recoverable
  after a limit change. No bucket configuration was changed. Hosted Storage
  acceptance and deployment-wide/global upload limits still require validation.
- Reported API roles had TRUNCATE on recording tables. #40 revoked it on personal
  document children; revised #41 revokes it on both recording tables, including
  PUBLIC. Tests verify truncation is denied and published room metadata remains.
- Four stored-SQL timestamp aliases match repository fingerprints. Never replay
  those files due only to timestamp differences. Five relevant deployed function
  bodies match repository source hashes; this is not full grant/schema parity.

## Design and failure invariants

History detaches without deleting content. Recording IDs are never silently
rewritten: the table lock makes the empty-table decision durable until commit.
If conversion or a later preflight fails, all changes in that migration roll
back. #40 and #41 remain separate transactions: failure of #41 does not undo #40.
RLS/row triggers cannot protect TRUNCATE, so revocation is explicit. Bucket-limit
checks precede new work admission; they do not prevent recovery of existing work.

## Validation

The new history regression failed before the change with the exact nonnullable
reference error, then the complete document-generation suite passed 18 tests.
The three initial recording regressions all failed before correction. The
recording suite passed 39 tests at that point; two additional rollback/retry
regressions then passed 2/2. Combined application revision b2dcd10 passed **459 tests, 0 failed/skipped**,
TypeScript, and lint (**0 errors, 28 existing warnings**). Final #41 3d30fab adds
only the local PostgreSQL runner assertions, separately executed successfully;
no application or migration changes followed that combined run.

The first production build failed because public Supabase variables were absent.
A retry passed with NEXT_PUBLIC_SERVER_RECORDING_RECOVERY=true and non-secret
localhost URL/key placeholders. This establishes buildability only, not staging
configuration or hosted workflows. Optional provider credential notices remain.
The supplemental read-only policy query also executed successfully on local PG16.

The isolated PostgreSQL 16.15 runner passed with actual #40 then #41 migrations,
TEXT recording IDs and NOT NULL study history: independent connections exercised
publication/deletion serialization, bulk cancellation/begin ordering, crash leases,
exclusive claims, cleanup and permanent tombstones. It also verifies UUID results,
TRUNCATE denial and detached history. These are local synthetic fixtures, not
hosted PostgreSQL 17.11 or actual Storage-service tests.

A fresh local pg_dump/pg_restore of the corrected database succeeded. Restored
history, document tombstones, deleted recording operations and TRUNCATE denial
were all verified. This is a logical database restore, not a provider audio-object
restore. Synthetic dumps/logs remain outside Git under /tmp.

Independent reviewer found no blocking findings and separately reproduced combined
migrations/publication/parent cleanup with actual generation triggers. The real
PostgreSQL runner now permanently includes the observed staging column shape.

## Deployment order and remaining gates

Do not merge yet. Preserve the staging deployment hold before any future merge.
Recheck the empty recording tables/bucket immediately before cutover. Following
approval, apply revised #40 then revised #41, deploy the combined application
with the recording flag enabled, verify disposable-account workflows, and only
then activate the bounded authenticated worker as detailed in the main runbook.
No separate compatibility migration or history replay is needed for these
unapplied PR migrations. The migration manifest is updated for their new hashes.
If an older revision has been applied elsewhere, stop and prepare a forward
migration rather than editing its ledger or replaying these files.

At this checkpoint the eight omitted policies and clear_own_recording_metadata
body were missing. The subsequent complete export resolved those evidence gaps;
confirmed corrections and remaining helper dependencies are in the linked review. Use the single supplemental script
[05-cutover-policy-gaps.sql](../staging-export/05-cutover-policy-gaps.sql); it groups
repeated predicates and returns no application rows. Inspect SQL privately before
sharing. In particular, keep existing launch quota policies; check compatibility
rather than dropping safeguards to allow operation-path uploads.

Provider Storage trigger compatibility and object restore, full deployed-schema
reconciliation (including untracked free_launch migrations), entitlement alignment,
Vercel deployment configuration, worker executor/configuration and hosted two-account
acceptance remain gates. Current empty objects do not certify future restore.

## Local fixture cleanup

The task-created integrity_recordings and integrity_cutover_restore_nov7 databases
were dropped after validation, and the task PostgreSQL cluster was stopped.
Synthetic dump/log evidence remains outside Git in /tmp/studysync-rehearsal-nov2
and /tmp/studysync-cutover-*. No hosted fixtures were created.
