# Staging rollout: document deletion, durable replay and recording recovery

Status: **preparation only; no hosted changes authorized or performed**. Review date:
2026-11-02; resumed final validation on 2026-11-04. Repository `Muj-04/studysync`; destination branch `dev`. The reviewed
starting dev is `18930427bb9b1098a8076689cbdcb636bbf18b28`. PR [#40](https://github.com/Muj-04/studysync/pull/40)
is a prerequisite of [#41](https://github.com/Muj-04/studysync/pull/41). Merge and
rollout are separate decisions. This document does not authorize either.

Staging project: `xokiiepdpjvqnpzwmbtb`. Production project
`mlyvadsznvyurjakovau` and `main` are outside this procedure. Stripe acceptance
remains deferred; do not configure or exercise payment providers.

## Decision and evidence

Use [the dated evidence](evidence/2026-11-02/review-and-rehearsal.md) for reviewed
heads, corrections and final check results. Local SQL fixtures prove specific
transaction, authorization and recovery behavior. They do not establish deployed
schema equivalence, Storage physical-object behavior, restore capability, or
hosted two-account acceptance. A green Preview build does not close those gates.

## 1. Read-only preparation — the next staging action

Repair or reconnect the existing Supabase connector so it can provide authorized
read-only access to staging; use its normal authentication flow if required. The
reported `Unknown tool` error does not establish that credentials are invalid.
Do not paste credentials into chat.
On 2026-11-02, and again on 2026-11-04, the connected `supabase.list_tables` tool returned
`Mcp error -32001: Unknown tool({"name":"supabase.list_tables"})`.
The read-only `supabase.execute_sql` probe also returned `Unknown tool` for
`supabase.execute_sql`; no staging query ran.
Capture a schema-only catalog export, migration history, Storage configuration and
deployed Storage version through the authorized connection or owner-operated
export. Do not apply migrations as an access test.

The release operator must reconcile and record:

- All applied migration versions versus repository files. Do not infer migration
  history from the existence of a few tables. Review existing function definitions,
  RLS policies, grants (including column grants), triggers and foreign keys.
- `documents` identity/owner fields and every referencing table, orphan or foreign
  child reference, standalone decks, and columns that must detach on deletion.
  Unknown linked tables, orphan/foreign rows and incompatible nonnullable columns
  intentionally stop the document migration. Reconcile without deleting content.
- Both `voice_notes.id` and `room_voice_notes.id` are UUID; both `page_number`
  columns are TEXT/VARCHAR. Verify the other columns against the actual migration.
  Check note UUID collisions across both tables and legacy object path ambiguity.
- `voice-notes` exists, is private and nonversioned (`DISABLED`, or a supported
  older schema without versioning fields), and has no archived versions/delete
  markers. Inspect through the Storage management/API interface, not by editing
  managed tables. If presently public, assess all stored public URLs before any
  privacy change: adoption preserves existing URLs and does not repair playback.
- `storage.allow_only_operation(text)` exists; the deployed Storage implementation
  accepts standard `object.upload`, rolls back its permission probe as expected,
  and permits the narrow final `storage.objects` commit trigger. Record provider
  version/commit. Source reviewed upstream is not proof of deployed version.
- Recording bulk deletion uses `READ COMMITTED` transactions. The RPC rejects
  `REPEATABLE READ`/`SERIALIZABLE` before mutation because an older snapshot can
  miss newly accepted work despite advisory locking; retry in a fresh supported
  transaction. Verify deployed API transaction settings.
- Actual document entitlement rules agree with the new quota guard (free: three;
  `pro`/`premium`/VIP: exempt). Entitlement alignment remains a separate gate.

Use the checked-in [catalog export pack](staging-export/README.md), starting with
[01-catalog.sql](staging-export/01-catalog.sql). It includes migration history,
columns/constraints/indexes, direct and column grants, default privileges, complete
role membership edges, RLS, function/view hashes, private definitions and aggregate
Storage/reference preflight checks. No raw export belongs in a public PR or chat.
The pack documents which optional blocks to skip when a relation is missing.

### Current discrepancies versus approval requirements

| Evidence | Status and required correction |
| --- | --- |
| Supabase discovery and SQL probes | Both return `Unknown tool`; no live catalog inspected. Supply the authorized read-only export before claiming schema/grant/RLS parity. |
| Historic billing migration identity | Repository documents hosted `20261027141735` versus local `20261027140326`. Verify current ledger and SQL equivalence; do not replay the local timestamp blindly. |
| Deployment sequencing | Dev has a post-merge Vercel deployment status; CI has no migration gate, and prebuild checks do not establish schema readiness. Confirm Vercel dev settings and approve an explicit staging deployment hold/cutover before merging. |
| Worker activation | Source exists; there is no installed scheduler or proven hosted execution. Approve an executor and server-only staging credential binding, then activate only after migrations and application checks. |
| Storage restore | The reviewed guard rejects published/legacy re-upload. Obtain a compatible provider restore procedure; logical local database restore alone cannot close this gate. |

The first, third and fourth rows are confirmed access/configuration-evidence gaps;
this is **not** a claim that unseen staging tables are incorrect. The historical
version alias and every conditional schema correction in the export checklist
still require current evidence. See the pack for the exact deployment evidence and
non-secret Vercel settings to inspect.

## 2. Backups and restore gate — before a cutover is authorized

Assign a named operator and record the backup timestamp, consistency boundary,
retention/location, encryption/access controls, restoration target and acceptable
recovery point/time. Quiesce writes and workers for a consistent checkpoint during
an authorized maintenance window, or use a provider-supported consistent backup
procedure. Database backups do **not** include Storage object bytes or browser-only
PDF/audio/unsynced edits. Export device-local recovery content before device resets.

The backup inventory must cover database data/schema, auth identities, grants/RLS,
functions/triggers, `document_lifetimes`, collection revisions/receipts,
`recording_private.operations`, Storage metadata, and a separate object-byte
manifest (path, size, checksum where available). Preserve the state linking these
systems; replaying an older database while retaining newer audio is not a
reconciled recovery point.

Rehearse into an isolated disposable target, not in place on staging or production.
The local evidence demonstrates PostgreSQL custom-format dump/restore and a
separate dummy-byte checksum; it is not a hosted backup/restore demonstration.

**Storage restore constraint:** the commit guard deliberately rejects re-upload
of published and legacy objects, even through an administrative insert. Ordinary
Storage API re-upload after restoring the final database is not a supported
restore plan. Obtain and rehearse a provider-supported compatible object restore
procedure and ordering before release. Do not disable the guard, change operation
states to bypass it, or guess an object-reupload sequence. Until this exists,
hosted audio restore remains a release blocker.

After restoring, reconcile paths/bytes against metadata and operation state,
verify auth identities and ownership, preserve deleted-document/recording
identities, and recheck grants/RLS. Verify legacy signed/public URLs and signing
keys/project origins rather than assuming restored URLs work. Keep clients and
workers stopped until the checkpoint is reconciled. Demonstrate authorized
playback, pending publication, cleanup, and denial of stale/deleted writes.

## 3. Build and migration cutover — only after separate authorization

1. Before any merge, confirm dev is a Preview/staging target and establish an
   approved hold on automatic **staging application activation** during cutover.
   Do not disable deployment protection or other security checks. No hold was
   installed by this work. If the platform cannot prevent an intermediate #40
   deployment from becoming active, stop and obtain a controlled deployment plan.
   Pin exact reviewed commits and ensure required CI passes. Rebase/retest if dev
   changes. Apply #40 before #41; #41 contains and requires #40's RPCs/generations.
2. Prepare the application build with staging public URL/key and
   `NEXT_PUBLIC_SERVER_RECORDING_RECOVERY=true` **at build time**. Configure
   `SUPABASE_SERVICE_ROLE_KEY` only in the server runtime for the playback endpoint.
   Never prefix it with `NEXT_PUBLIC_` or put it in logs, artifacts or browser code.
   Keep provider features without acceptance (including Stripe) out of this test.
3. Schedule a bounded maintenance window and stop new writes through an approved
   maintenance mechanism. Old tabs cannot continue writing during mixed-protocol
   cutover. Notify testers to export pending local content and reload after cutover.
   Do not disable RLS/CAPTCHA/rate limits/protection. If no maintenance mechanism
   exists, implement/approve one separately rather than assuming zero downtime.
4. Take and verify the checkpoint from section 2. Record the migration ledger and
   current app revision before changes. Rehearse the same two files first against
   a sanitized copy of the actual catalog and representative data.
5. Apply through the authorized migration mechanism, once and in this order:

   ```text
   20261028202847_document_generation_guards.sql
   20261028203014_server_recording_operations.sql
   ```

   Each file has its own transaction. The second failing does **not** roll back the
   first. Stop on errors and inspect the actual ledger/schema; never blindly rerun
   non-idempotent DDL or mark a failed migration applied. Do not edit hosted tables
   to make preflight pass. Document migration preserves existing content and
   rejects inconsistent rows; recording migration adopts recognized legacy paths
   and quarantines ambiguous ones.
6. Verify new RPCs/grants and the final Storage guard. Deploy the prepared app
   version to a protected **staging-only candidate** under a separate authorization,
   keeping the activation hold until the next step. A new client against
   the old schema fails; old collection writers after migration fail closed. The
   recording flag's default false is incompatible after the recording migration.
7. Merge #40 then #41 only under the approved activation hold, or use the approved
   exact combined candidate deployment procedure. Never activate the intermediate
   document-only application against the final recording schema. Verify the final
   staged artifact contains both PRs before moving the staging alias or reopening
   access. This is not authorization to merge now or promote anything to Production.
8. After the final app is active in staging and basic authorized access works,
   inspect the eligible queue before invoking a worker. `--limit=1` is a count
   bound, **not a fixture filter**: the worker claims the oldest eligible operation
   globally. A test pass is allowed only when the eligible queue is verified to
   contain exclusively identified disposable fixtures, or in an independently
   authorized isolated fixture environment. If other operations are eligible,
   stop and obtain specific operational authorization; do not modify their state
   to force a fixture claim. Run one approved bounded pass, verify its actual
   claimed identity and durable result, then enable the
   approved recurring schedule from section 4 with monitoring. Do not run a worker
   against the old/partially migrated schema or a Production URL.
9. Complete bounded two-account and failure/retry acceptance with the worker
   operating, then reopen staging writes and end the activation hold. Reload old
   tabs only after pending content is retained/exported. Do not delete browser
   outboxes as a troubleshooting shortcut.

## 4. Worker operation and authentication

No scheduler is installed by these PRs. An operator or separately authorized
scheduler must run a pinned checkout with Node 22+ and lockfile dependencies.
The CLI loads `typescript` at runtime, so use `npm ci --include=dev` in the worker
artifact; a production-only install is insufficient. Restrict artifact/secret
access to the worker service identity.

Provide `SUPABASE_URL` for **staging** and `SUPABASE_SERVICE_ROLE_KEY` from the
existing secret manager/server environment. Before first invocation, assert the
URL hostname is `xokiiepdpjvqnpzwmbtb.supabase.co`. The service role is privileged;
there is no public worker HTTP endpoint or browser invocation. Do not print the
key or copy it into command arguments, cron files or PRs.

After deployment authorization, schedule one invocation per minute on an existing
approved executor, with a single active invocation per environment. An example
command for that executor (not installed by this work):

```sh
node scripts/run-recording-worker.cjs --run --limit=20
```

A pass attempts at most 20 operations over a one-minute budget; individual CLI
requests have a ten-second deadline. Database claims use row locking and two-minute
leases, with retries backing off up to five minutes. Use the executor's lock and
an outer timeout (for example 90 seconds); interrupted work is reclaimed after
lease expiry. Record nonzero exits and pass summaries without credentials.
The worker's `completed` counter describes successful RPC attempts, not necessarily
final publication; monitor durable operation states as the authority.

## 5. Monitoring and bounded hosted acceptance

Record deployment revision, migration versions and worker version together.
Privileged read-only monitoring should inspect queue age, attempts, next attempt,
expired leases and blocked operations. Example aggregate (no recording content):

```sql
select state, count(*), min(created_at) as oldest_created,
       min(next_attempt_at) as next_due, max(attempts) as max_attempts,
       count(*) filter (where lease_until < now()) as expired_leases
from recording_private.operations group by state;
```

Initial operational thresholds: alert on any worker nonzero exit; investigate due
work with no progress for ten minutes, attempts >= 5, or any `blocked` row. These
are starting thresholds to tune with bounded staging evidence, not measured SLOs.
Do not auto-delete blocked/legacy/untracked objects. Review the privileged
`recording_private.untracked_audio_inventory`; quarantine and reconcile ambiguous
references. Provider cleanup failures must leave durable retries and retained bytes.

Use two explicitly disposable accounts and a fixture manifest; no unrelated users,
mail or invitations. Keep requests bounded. Capture these acceptance results:

- A reads and edits offline; B cannot read or mutate A's documents. Delete A's
  document from another A session, reconnect, and verify original remains deleted,
  edits export, and explicit new-copy recovery preserves content under a new ID.
- Stale same-account tab versus newer acknowledged edits: preserve a conflict;
  never silently overwrite. Switch accounts during delayed reads/writes.
- Upload success with lost publication response and browser closure: the worker
  publishes once. Deletion before late upload/publication cannot resurrect it.
  Verify actual provider cleanup after a rejected final metadata insert.
- Room membership revocation denies new publication/playback issuance and retains
  the documented behavior for existing shared contributions. Previously signed
  playback URLs may live for their requested 60 seconds/cache window; verify it.
- Worker interruption, duplicate claim, transient publication/removal error and
  lease expiry recover without deleting referenced audio. Confirm physical object
  deletion and metadata acknowledgment through the provider API.
- Play pre-existing legacy recordings after cutover. A private bucket transition
  and old public/signed URLs need explicit acceptance, not just successful adoption.

Clean up only manifest-owned fixtures through normal application/API deletion;
verify operation cleanup completed and record any retained local/browser fixtures.

## 6. If deployment fails

Keep the maintenance window active and stop the scheduler while diagnosing.
Preserve errors, checkpoint, browser outboxes and operation/tombstone state.

- If a migration transaction fails: verify rollback and ledger. If only #40 applied,
  its old-writer denial still applies. Repair forward with a reviewed change; do not
  start the old app and assume compatibility.
- If app activation fails after migration: prefer a corrected compatible build.
  App-only rollback or flipping the recording flag false reactivates an incompatible
  protocol. Never regrant legacy writes or remove tombstones to restore availability.
- If the worker fails: uploaded valid bytes remain eligible for retry; restart the
  corrected worker after lease/backoff expiry. Do not manually republish deleted or
  blocked operations. Bytes never uploaded require the originating device's export.
- If data restoration is necessary: use the approved isolated restore procedure
  from section 2, reconcile DB and objects, verify invariants and authorization,
  and obtain approval for target switching. Never restore over production here.

Exit maintenance only after checks pass on the exact deployed candidate. Record
remaining blocked checks explicitly; code review, local fixtures and Preview CI
are not permission to promote to production.

## Provider documentation consulted

[Supabase backups](https://supabase.com/docs/guides/platform/backups) explicitly
exclude Storage object bytes from database backups. [Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design)
requires object operations through the API and discourages managed-schema changes.
The custom commit trigger therefore needs explicit deployed-version compatibility
evidence; the local rehearsal is not an exception to those provider constraints.
