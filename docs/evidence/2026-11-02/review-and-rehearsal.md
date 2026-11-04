# Independent PR review and local rehearsal — 2026-11-02

Scope: PRs [#40](https://github.com/Muj-04/studysync/pull/40) and
[#41](https://github.com/Muj-04/studysync/pull/41), against freshly fetched
`origin/dev` `18930427bb9b1098a8076689cbdcb636bbf18b28`. No merge, hosted migration,
worker deployment or production change is part of this work.

Review began 2026-11-02 and resumed for final validation on 2026-11-04.

## Reviewed source and corrections

Initial remote heads were #40 `11ed16e647e1f3b6402231f7713947a7663f30f6` and
#41 `ef4f60692cd77acd6f9dbe3b688c6065f90de5a6`. Actual code, SQL, tests and GitHub
checks were inspected; prior handoff conclusions were not accepted as review proof.
The initial heads' CI and Vercel checks passed. #41 contained the exact #40 head;
this dependency is rechecked after the corrections below.

- **P1, stale document replacement:** shared browser revision baselines and
  acknowledgement rebasing could let a stale tab overwrite newer content. The fix
  binds observed revisions to the editor and durable successor chains to their
  writer. Same-tab dirty/cache hydration also must not certify a revision whose
  rows were rejected or never applied. Regression coverage exercises peer reads,
  peer acknowledgements, reloads, legacy journals, raw edits before debounce and
  delayed/rejected hydration. Conservative conflicts retain content for recovery;
  they are not permission to overwrite a newer cloud snapshot.
- **P1, recording resurrection after bulk deletion:** enumeration of published
  metadata omitted accepted operations awaiting publication, including another
  tab's upload. Scope cancellation now serializes with begin, includes pending
  operations, and fences captured local identities. Review also corrected cleanup
  after parent deletion, strict owner/generation tombstone retries after a lost
  response, and library deletion without a cached generation. SQL tests and real
  separate-connection tests cover the relevant ordering.

- **Unsupported-isolation acknowledgement:** a real two-connection test showed a
  `REPEATABLE READ` snapshot could miss an accepted recording and return zero
  cancellations. Bulk deletion now rejects unsupported isolation before mutation;
  a fresh `READ COMMITTED` call cancels the operation. Both local PostgreSQL
  runners also prevent inherited libpq network/service overrides from bypassing
  their local-only boundary.

Independent reviewers separately assessed document persistence, recording SQL and
worker behavior, and cutover/recovery procedures. Follow-up review found the
post-parent cleanup and lost-response integration cases before finalization. The
local rehearsal itself was reviewed: it now removes libpq TCP/service environment
overrides and tests actual stale-revision rejection and receipt replay after restore.

Reviewer red/green evidence: the recording bulk-deletion regression observed local
playback being cleared (actual zero notes versus one retained note expected);
subsequent regressions reproduced missing scope cancellation, lost-response
rejection and uncached-generation refusal before the fixes. Those red runs were
observed in reviewer tool output, not saved as persistent log files. Green recording
logs were saved locally; final combined results are recorded below.

## Reproducible database rehearsal

Run the checked-in [local rehearsal](local-rehearsal.cjs) against the final combined
candidate checkout. Use PostgreSQL 16 tools, an explicitly created local Unix
socket cluster and a task-owned port/user. Example environment, with paths replaced
by the operator's local paths:

```sh
REHEARSAL_PG_BIN=/path/to/postgresql/bin \
PGHOST=/tmp/studysync-local/socket PGPORT=55440 PGUSER=local_user \
node docs/evidence/2026-11-02/local-rehearsal.cjs /path/to/combined-candidate
```

The script creates and drops its own `integrity_rehearsal_<pid>*` databases and
retains synthetic dump files under a printed `/tmp/studysync-restore-evidence-*`
directory. It does not use provider APIs or hosted credentials. The source fixtures
are deliberately assembled from repository test schemas; they are **not** a dump
of deployed staging. PostgreSQL roles already exist in the same isolated cluster
for restore; cross-cluster role/credential provisioning is not established.

Observed on local **PostgreSQL 16.15**:

1. A custom-format pre-cutover database backup restores exact existing document,
   annotation, recording and Storage metadata rows into a second database.
2. An orphan child blocks the document migration. Its transaction rolls back and
   the orphan content remains intact.
3. A public bucket blocks the recording migration without partial operation schema
   or metadata loss. With the supported fixture contract, migrations apply in order
   and adopt the existing recording while preserving annotations.
4. A post-cutover custom-format dump restores exact document content, recording
   operation IDs/state, tombstones, write receipts and an interrupted worker lease.
5. Restored permissions reject direct writes, cross-account access and client worker
   claims. Deleted document IDs remain unusable; stale revisions fail and identical
   write receipts replay. An expired lease is reclaimed; the old lease cannot
   publish; valid uploaded audio remains publishable after admission expiry.
6. Published/legacy object re-upload is rejected by the restored commit guard. This
   is evidence of the **unresolved hosted object-restore constraint**, not successful
   provider restore.
7. A separate synthetic local audio file is copied and checksum-verified. This only
   demonstrates a separate byte backup requirement; it is not S3/Supabase restore.

All rehearsal databases are dropped in `finally`. Source files, dumps and logs are
synthetic local evidence. The separate document and recording PostgreSQL scripts
exercise independent connections rather than single-connection mocks.

## Hosted access and release gates

On 2026-11-02 both existing authorized connector calls failed before any
query: `supabase.list_tables` and read-only `supabase.execute_sql` returned MCP
`-32001 Unknown tool` errors. Thus deployed migration history/catalog, Storage
version/configuration, objects and actual permissions could not be inspected.
A fresh `supabase.list_tables` retry on 2026-11-04 returned the same error.
No credentials were requested and no safeguards were bypassed.

Outstanding hosted work: read-only catalog reconciliation; an approved compatible
Storage restore procedure; backup/restore acceptance; entitlement alignment;
actual upload/delete/playback behavior including legacy URLs and rejected final
inserts; two-account isolation/revocation acceptance; and an approved worker
executor, credentials and monitoring. Stripe acceptance remains deferred.

Use [the staging runbook](../../staging-integrity-rollout.md). Its first action is
read-only access/catalog capture, not applying migrations. Database migration and
application activation require a coordinated maintenance window. The second
migration failing does not undo the already-committed first one. Application-only
rollback or disabling guards is not a recovery procedure.

## Final source identity

- PR #40: `30946ecee036a2e505357fdf3be0fceb795d40fe`.
- PR #41 and isolated combined integration: `4303b7e77e68e03e5507c33c52c4f69949f45272`.
- `git merge-base --is-ancestor` confirms both current dev and the exact final #40
  head are ancestors of #41. The integration worktree is clean; no conflict was
  resolved by dropping either PR's workspace changes.
- Document migration SHA-256:
  `ff0c6b06cf8e6c12cb9d50f20d461895f38882c84ae662590af71ad406d339b6`.
- Recording migration SHA-256:
  `ecc952f00985024ddc1fba6b293e1708c094d30dfa7f6e89e105d6c8258f266d`.

The recording migration changed during review. These are the files rehearsed;
previous hashes/evidence must not be substituted if a deployment is authorized.
No hosted application of either version occurred in this task.

## Final validation

| Check | Result |
| --- | --- |
| PR #40 final GitHub CI | **399 tests passed**, TypeScript and lint passed |
| PR #41 final GitHub CI (combined code) | **453 tests passed**, TypeScript and lint passed |
| Local combined `npm test` | **453 passed**, 0 failed/cancelled/skipped/todo |
| Local combined production build | Passed with `NEXT_PUBLIC_SERVER_RECORDING_RECOVERY=true` and authorized public staging configuration |
| Local TypeScript | `npx tsc --noEmit --incremental false` passed |
| Local lint | **0 errors, 28 existing warnings** |
| PostgreSQL document concurrency | **8 scenarios passed** using independent connections |
| PostgreSQL recording concurrency | Passed isolation rejection, bulk/begin ordering, exclusive claims, crash retry, publication/deletion, cascade cleanup and tombstone cases |
| Logical migration and backup/restore | **7 checkpoints passed** as detailed above |
| Local Chromium production-build recovery | **2 viewports passed**, 1440px and 390px; mocked providers, keyboard recovery, ZIP contents, missing-source refusal, no original-document writes or page errors/overflow |
| Independent final hydration review | **34 focused tests passed** after reproduced queued-render failure |
| Independent recording/cutover review | **43 focused tests passed**; final isolation delta additionally reviewed and exercised by root |

[PR #40 CI](https://github.com/Muj-04/studysync/actions/runs/41895838480) and
[PR #41 CI](https://github.com/Muj-04/studysync/actions/runs/41895840369) were inspected
on the final revisions. Both Vercel Preview checks passed. The combined
[Preview](https://pdf-study-workspace-git-fix-server-reco-829596-muj-04s-projects.vercel.app)
is a build result, not hosted workflow acceptance. Build notices for unavailable
local Anthropic/Stripe/service-role configuration do not imply provider tests ran.

Plain-text [validation output](validation-output.txt) records the completed local
commands. Full local logs are under `/tmp/studysync-rehearsal-nov2/`; the rehearsal
output names its synthetic dump directory.

## Cleanup and recommendation

No hosted users, documents, recordings, invitations, payments or fixtures were
created. Rehearsal databases were dropped automatically; the task's
`integrity_recordings` database was dropped, its local PostgreSQL cluster stopped,
and the local app server/browser contexts closed. Synthetic logs, dump artifacts,
local cluster files and isolated worktrees remain as evidence. Unrelated work was
preserved.

The code changes have cleared independent review. Merge #40 before #41 only as
part of a coordinated staging cutover: merging into an automatically deployed dev
environment while its schema remains old breaks the new client protocol. Do not
promote this to a production-readiness claim. The documentation can be reviewed
independently. No PR was merged in this task.

The precise next staging action is to repair the existing read-only Supabase
connection (or use an authorized owner-operated catalog export), confirm project
`xokiiepdpjvqnpzwmbtb`, and capture migration history, schema/grants, Storage version,
bucket configuration and legacy-object inventory. Reconcile that evidence and
approve/rehearse a compatible restore procedure before authorizing migrations or
worker deployment. Do not request or transmit secrets in chat.
