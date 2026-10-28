# Document write protocol implementation plan

Goal: deletion wins at the server while client edits retain their original owner,
generation, observed revision and operation ID for explicit recovery.

Architecture: database guards and CAS collection RPCs are supplied by the schema
PR; the client protocol adapts existing domain APIs, and the dependent offline PR
persists outboxes and exposes recovery. A preflight-only client check cannot
prevent a delete/write race, so the database remains authoritative.

Invariants and failure cases:
- Registration never reuses a tombstoned ID. Missing and deleted are distinct.
- Captured owner is checked before and after awaited operations. Queued work cannot
  acquire a replacement account's identity when it eventually runs.
- A collection snapshot carries data and revision from one database transaction.
  Writes use that observed revision, never a freshly fetched revision as permission
  to overwrite unrelated newer work. Lost acknowledgements retry the same ID/payload.
- Rejected/deleted/conflicting writes keep their content in the durable outbox.
  A new identity is required for explicit recovery; no automatic restore.
- The application and migration are a coordinated rollout: old whole-collection
  writers must fail closed once database enforcement is enabled.

Implementation and checks:
- [ ] Add failing adapter regressions for deleted registration, owner switching,
  unknown baselines, stale revisions and lost acknowledgements.
- [ ] Implement generation-aware registration and snapshot/write adapters in
  cohesive modules; adapt document annotations, flashcards and session writes.
- [ ] Connect the dependent outbox interface without altering its persisted owner
  or revision; run relevant tests and independent review.
- [ ] Integrate schema/client/offline/recording candidates in an isolated branch;
  run tests, TypeScript, lint, build and meaningful browser recovery checks.
- [ ] Open focused dependent PRs, monitor final CI and document rollout/recovery.

No hosted migrations, worker deployments, production operations or merges. Backup,
schema reconciliation, entitlements and hosted two-account acceptance remain gates.
