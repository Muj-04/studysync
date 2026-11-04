# Staging catalog export and readiness decision

Target **only** `xokiiepdpjvqnpzwmbtb`. No migration, application deployment, worker
activation or configuration change is authorized by these instructions.

## What to run

1. Open the [staging SQL Editor](https://supabase.com/dashboard/project/xokiiepdpjvqnpzwmbtb/sql/new).
   Confirm the project reference in the dashboard URL. Use the already-authorized
   SQL Editor role; no passwords, connection strings or tokens need to be sent.
2. Paste and run [01-catalog.sql](01-catalog.sql). Save its single 17-row result
   grid as a private CSV/JSON export, with capture time and project reference.
   This reads catalog metadata even if either reviewed migration is absent.
3. Inspect `identity`, `roles` and `relations`. For data-count queries, the
   execution role must have `superuser` or `bypass_rls` true, and SELECT permission
   on the required tables. Otherwise **stop** and obtain an authorized full-visibility
   export. Do not change roles, grant permissions or disable RLS to run this pack.
   Filtered counts under another role cannot establish the absence of bad rows.
4. Run each applicable transaction in [02-history.sql](02-history.sql) separately;
   save each result. Skip a block if its relation is missing in step 2 and report
   that absence. Storage schema migration IDs do not identify its deployed service
   version. A null checksum is unknown, not a match.
5. If the catalog contains the required tables/columns listed at the top of
   [03-preflight-counts.sql](03-preflight-counts.sql), run it and save its single
   six-row result grid. Its `capture.full_row_visibility` must be true. It returns
   bucket settings and aggregate counts, not document text or object names/URLs.
   Missing prerequisite tables/columns are discrepancies; do not improvise DDL.
6. [04-private-definitions.sql](04-private-definitions.sql) supplies function/view
   definitions for authorization review and an optional separate migration-SQL
   block. Run only the applicable blocks. Inspect these locally before any handoff.
   Compare the historical billing migration by stored SQL/content, not timestamp.

Every block explicitly starts a read-only transaction and uses a 30-second
statement timeout. These are session-local guards, not persistent configuration
changes. After any error, execute `ROLLBACK;`, retain the error, and stop that
block. Do not raise limits or retry expensive counts in a loop. Separate blocks
have separate snapshots: this is a reconciliation pack, **not a consistent backup**.
Repeat affected metadata capture if the schema changes before cutover approval.

Keep **all** exports private. Even catalog defaults, policy expressions, index or
trigger definitions can contain hardcoded literals. No query reads role passwords,
Auth tokens, Vault contents or environment values, but that cannot guarantee that
legacy schema code contains no embedded secrets. Never paste secrets in chat or
commit raw exports to #42. Provide only inspected/sanitized metadata through the
approved private workspace; report omitted secret-bearing definitions separately
so their authorization cannot be falsely marked reviewed.

## Compare against the reviewed source

Source heads: #40 `30946ec`, combined #41 `4303b7e`; dev remains `18930427`.
[reviewed-migrations.tsv](reviewed-migrations.tsv) records repository filenames and
SHA-256 hashes at the reviewed combined head. It is an inventory, **not an apply
list**. Some historical filenames/hosted versions differ. Do not run a blind
`db push`, repair history, or replay all unmatching timestamps.

| Check | Required evidence / correction before approval |
| --- | --- |
| Migration ledger | Match names, versions and SQL semantics to the manifest. Historical billing alias: local `20261027140326` vs documented hosted `20261027141735`, both `serialize_billing_reconciliation`; current status unverified. Confirm equivalence before recording a mapping; do not replay by filename. |
| Partial protocol state | If either new migration/version or its objects already exist, reconcile exact definitions and hashes. They are non-idempotent files; do not apply twice or assume a missing history row means missing schema. |
| Document-linked tables | Every discovered table must be on the reviewed list; orphan/foreign/generation mismatch counts must be zero. Four detachable references (`community_posts`, `study_sessions`, `flashcard_decks`, `session_state`) must permit NULL. Preserve content when correcting inconsistent data. |
| Recording column contract | Both recording IDs UUID, page keys TEXT/VARCHAR, and all referenced columns present. Text IDs/integer pages need a separate reviewed compatibility correction before these migrations; no automatic destructive cast. |
| Cross-table note IDs | Collision count zero; otherwise resolve identity mapping explicitly before adoption. |
| Bucket / object metadata | Existing private `voice-notes` bucket; nonversioned; no archived versions/delete markers. A public bucket needs an approved privacy/playback transition, not a direct SQL edit. Missing metadata does not prove missing physical bytes. |
| Legacy audio | Classify public/signed URLs, ambiguous paths and conventional paths lacking Storage metadata. Reconcile playback and object references; unknown paths must remain quarantined, never automatically deleted. |
| Storage helper/version | `allow_only_operation(text)` and actual helper definition compatible; obtain deployed **service version/commit** separately. Check provider probe/final-admin-insert and rejected-upload cleanup behavior in hosted acceptance. |
| Grants/RLS | Inspect direct and column grants, PUBLIC defaults, all custom-role flags and transitive memberships (including PG16 inherit/set options). New lifetime/receipt/private tables must not expose mutation paths; public exposed tables require appropriate RLS. An owner policy name alone is not proof of authorization. |
| RPCs/views | Review security-definer ownership, search paths, executable roles and actual authorization bodies. Tombstone view must be security-invoker; views/definer functions can bypass underlying RLS. Compare definitions, not just existence. |
| Transaction isolation | Bulk recording cancellation requires READ COMMITTED. Other isolation modes fail closed; verify API role/function defaults and provider configuration, not merely the export session's isolation. |
| Provider and operations | Compatible database+object restore procedure, approved executor/worker identity, monitoring and bounded two-account acceptance remain separate gates. No local SQL export closes them. |

The pack excludes application content and avoids exposing object paths by default.
Aggregate counts can identify a problem but cannot resolve individual records:
record-level remediation must be separately scoped with authorized access.

## Deployment evidence and remaining access

The connector was rediscovered and retried during this continuation: both
`supabase.list_projects` and read-only `supabase.execute_sql` returned MCP `-32001
Unknown tool`. No hosted query ran. This is a tool/connection failure, not evidence
that a particular password or permission is wrong. There is no connected Vercel
management tool or saved Vercel CLI authentication in the checked standard paths.

Observed GitHub evidence:

- Dev merge `18930427` occurred at `2026-10-28T18:44:25Z` and received a successful
  [Vercel status](https://vercel.com/muj-04s-projects/pdf-study-workspace/FU7s4j7FPMCLyQGDR8XvCVYYhQ8h)
  at `18:45:44Z`. Current PR pushes also generate Vercel Preview deployments.
- `.github/workflows/validate.yml` runs installation, lint, tests and TypeScript;
  it has **no migration or schema-readiness step**. The repository has no checked-in
  Vercel branch deployment hold/ignore rule.
- `scripts/check-preview-environment.cjs` checks staging URL and some key ownership/
  test-mode constraints when `VERCEL_ENV=preview`. It does **not** check migration
  readiness or require the recording protocol flag. Thus a green build can ship an
  incompatible client against the old schema.

**Operational conclusion:** treat merging to dev as immediately deployable through
Vercel's Git integration. Automatic deployment is strongly supported by observed
behavior and [Vercel's Git deployment model](https://vercel.com/docs/git), but current
branch filters, production-branch setting, aliases and branch-specific environment
values cannot be certified without management access. A GitHub CI success does not
serialize Vercel deployment after migrations.

In the Vercel dashboard, inspect (do not change) project `pdf-study-workspace`:
production branch, Git deployment/ignore rules for dev, environment target and
aliases for dev, build command, whether the recording flag is true in the **build**
environment, and whether required staging server credentials are present. Record
non-secret settings only; do not export credential values. Ensure dev is not the
Production target. Existing deployment protection remains enabled.

## Smallest next action

Run **01-catalog.sql in the staging SQL Editor and save the inspected result**.
Together with the non-secret Vercel settings above, this unlocks a concrete
schema/deployment discrepancy review. It is not sufficient by itself to approve
cutover: approval still requires a reconciled catalog, viable restore plan and a
controlled migration-before-application-before-worker sequence in the runbook.

## Local validation of this export pack

All four final SQL files executed successfully on the task-owned PostgreSQL 16.15
fixture, with explicit read-only transactions. The catalog query also executed on
a database without application tables. A synthetic unreviewed linked table with
one orphan was correctly reported as `reviewed_table=false` and orphan count one;
`capture.read_only=on` and full row visibility were confirmed. The optional history
blocks were exercised against synthetic ledger rows, not hosted history.

Independent review checked read-only safety, confidentiality, inherited-role
coverage, result-set completeness and worker activation order. Findings were
corrected before publication. The task database was dropped and the local server
stopped; no hosted fixture, schema, grant, bucket or setting was modified. Local
logs remain under `/tmp/studysync-rehearsal-nov2/` (`01-catalog.sql.log` through
`04-private-definitions.sql.log`, `catalog-empty-local.log`,
`catalog-detection-local.tsv`). This validation does not reconcile unseen staging.
