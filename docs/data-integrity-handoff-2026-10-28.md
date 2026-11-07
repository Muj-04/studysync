# Data-integrity implementation handoff — 28 October 2026

## Scope and baseline

Starting remote dev: `18930427bb9b1098a8076689cbdcb636bbf18b28` (323 tests;
PRs #15–#39 merged). This continuation implements the approved policy: deletion
wins for the original document; unsynced edits remain available through explicit
recovery/export. No old audit findings were reopened without new evidence.

Document candidate code: `d32e452b09e3d3511267b1f19587885a308fd492` on
`fix/document-recovery-outbox`. Recording operations are a dependent candidate;
combined validation and PR links will be recorded below when complete. Neither
candidate has been merged or applied to a hosted database.

## Implemented document boundary

- Permanent owner/generation lifetimes distinguish deleted IDs from never-uploaded
  documents. Parent deletion and annotation cascades share a database transaction.
- Generation guards, CAS revisions and payload-bound idempotency receipts protect
  writes. Old direct collection mutations and the legacy replacement RPC fail
  closed, including previously granted column privileges. Dedicated authorized
  RPCs preserve flashcard creation/review, reading position and explicit bulk clear.
- Owner/document/generation-bound browser outboxes retain blocked/conflicting work,
  retry frozen operations, and reject missing acknowledgements. Recovery copies
  use new IDs, fresh child IDs and the normal server document quota.
- Local source files, pre-debounce edits and audio backups remain exportable.
  Browser storage failure is visible; in-tab snapshots do not promise persistence
  after the browser is closed or its storage is cleared.
- Source deletion detaches independent shared posts/history/decks rather than
  destroying their copied content. Original-document write receipts are purged
  after deletion; only opaque lifetime tombstones remain.
- Legacy audio cleanup remains before the final parent delete. The dependent
  recording operation migration closes the remaining cross-service race and
  provides browser-independent cleanup; document-only rollout is not recording
  durability acceptance.

## Document evidence

| Check on document code candidate | Observed result |
| --- | --- |
| `npm ci` | Passed, zero reported vulnerabilities |
| `npm test` | **374 passed**, 0 failed/cancelled/skipped/todo |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run lint` | Passed: **0 errors / 28 existing warnings** |
| `npm run build` | Passed with existing public staging configuration |
| Local PostgreSQL 16 independent connections | **8 scenarios passed** |
| Local Chromium, mocked providers | Desktop 1440px/mobile 390px recovery UI, keyboard access, ZIP content, missing-source refusal; no page exceptions or horizontal overflow |

PostgreSQL scenarios cover write/delete ordering, stale legacy insert after delete,
queued replay after delete, competing CAS writes, concurrent duplicate receipt
processing, repeatable-read deletion, concurrent document quota and consistent
row/revision snapshots. They use a disposable database and local Unix socket.
They are additional to the normal PGlite test suite, not hosted Supabase tests.

Independent reviewers cleared schema `4cbbec2` and client `6135d5d`; test-only
schema follow-up `35fabaf` and the legacy-audio compatibility delta `4ce95fa` were
also reviewed. Important findings corrected before integration: legacy direct
writes bypassing CAS, deleted receipt retention, null acknowledgements, recovery
snapshot ordering, account-implicit bulk operations, and IndexedDB repair after
account switching. Targeted regressions ran for the corrections.

Local logs: `/tmp/studysync-integrity-documents-{tests,tsc,lint,build,postgres}.log`;
browser evidence `/tmp/studysync-integrity-browser-documents-final.log`.
Earlier diagnostic runs with stale mocks and the obsolete parent-delete fixture
failed; those results are not described as passing. The first browser attempt hit
the ordinary onboarding overlay; the final fixture dismisses it through its UI.

## Migration and application rollout

1. Keep the separate backup/restore and deployed-schema reconciliation gates open.
   Rehearse against a sanitized copy of the actual catalog/history: repository
   fixture schemas are not a complete hosted bootstrap.
2. Apply the reviewed document migration
   `20261028202847_document_generation_guards.sql` before the recording operation
   migration. It deliberately stops on orphan/foreign legacy references; reconcile
   those records explicitly without silently dropping content.
3. Coordinate application activation with the migration: old collection writers
   are denied afterward, and new clients require the new RPCs. Use an operator-led
   maintenance/cutover procedure; no such operation was performed here.
4. Recording migration/application flag/worker/playback requirements belong to the
   dependent recording runbook. A worker source file alone is not an operational
   recovery service. Hosted worker deployment is not authorized by this work.
5. Verify the exact deployed candidate with two disposable accounts before release.

Prefer forward repair. Reverting only the application leaves old writes denied;
removing tombstones or re-enabling old writes would undo deletion guarantees.
Export retained browser work before device reset, logout-data cleanup changes or
rollback. Database backup does not include browser-only PDF/audio bytes or prove
object-storage restore capability.

## Remaining release gates and limitations

Backup/restore evidence, deployed-schema reconciliation, entitlement alignment and
hosted two-account isolation/collaboration testing remain separate gates. Stripe
acceptance remains deferred. Hosted Auth, Realtime, Storage upload/cleanup and
provider-specific final-commit behavior are not certified by local fixtures.
Prior access evidence was a Supabase connector `Unknown tool` failure and Preview
SSO; no protection was disabled and no credentials were requested.

Recovery export is device-local. A missing source PDF blocks new-copy creation
before quota is consumed; annotation content can still be exported. Conflicts are
explicit rather than auto-merged. Cross-tab alternatives remain in the export;
a new copy selects the latest captured payload per scope. Browser-cleared bytes
cannot be reconstructed by a server worker.

No hosted accounts, documents, audio objects, emails, invitations or payments were
created. Temporary local PostgreSQL/browser fixtures are owned by this task and
will be stopped/dropped at completion; evidence files and isolated worktrees remain.
Production/main have not been modified.
