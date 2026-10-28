# Cached edits and remote deletion

The bounded fix removes workspace hydration's unconditional upload of text-note
pages missing from a successful cloud result. A missing page may have been deleted
elsewhere. Hydration now performs no replacement write for that cache; local text
is retained, and explicit edits/pending outbox entries still use the existing hook.
This is not complete remote-document deletion protection or offline synchronization.

## Confirmed remaining document-level conflict

`upsertDocument` runs when a cached document becomes active. `ensureDocument`
uses an insert-on-conflict before dependent writes. The process-local deletion
queue protects same-client delete/save ordering but is not a durable cross-device
tombstone. Consequently an old device can recreate a deleted parent, and an
explicit pending write can restore deleted annotations. Client preflight SELECT
alone cannot close a concurrent delete-versus-insert race. Existing IDs alone do
not establish whether a missing row was never uploaded or was deleted.

No generic replay has been added for drawing/blank/image pending markers: replaying
those automatically before this boundary is resolved would extend resurrection to
more data. Local copies have not been purged to hide the ambiguity.

## Product decision and implementation options

1. **Deletion wins, edits retained as a recovery copy (recommended):** persist an
   owner-scoped document tombstone/generation transactionally at deletion. All
   parent and annotation writes must validate the generation server-side. Stale
   edits remain local and can be exported or explicitly copied to a new document
   ID. Deleting a document does not authorize discarding unsynced local edits.
2. **Explicit restore of the original document:** same tombstone/generation guard,
   plus a deliberate restore action that creates a new generation. Review how
   collaborators and historical links behave. Never restore merely on opening a
   cache or reconnecting.
3. **Automatic conflict copies:** create a new document ID for stale edits with
   visible provenance. Requires product rules for duplicate copies, quotas and
   which annotations/binary content belong to that copy.

Before durable replay: choose a policy; add transactional server enforcement/RLS,
versioned outboxes bound to account and document generation, and visible recovery
status/export. Schema changes must be delivered as reviewed migrations with local
SQL failure/concurrency tests. No hosted migration is authorized or applied here.

## Validation scope

The workspace regression executes the actual hydration effect against an empty
successful cloud snapshot and verifies zero annotation writes while preserving the
input cache. Related actual-hook tests cover pending edits, successful replay vs
stale hydration, account/lifetime cancellation and failed reads. These are local
controlled tests, not hosted cross-device acceptance.
