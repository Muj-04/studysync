# Document deletion, offline edits and recovery

This client requires the coordinated generation/tombstone/collection revision SQL
migration. Deploying only the client deliberately fails writes closed. No hosted
migration has been applied or provider behavior certified by local tests.

Deletion wins for an original document ID. Explicit registration uses an immutable
generation; annotation writers no longer recreate a missing parent. Each write
retains the authenticated owner, document/generation, collection/page, observed
revision, write ID and exact rows before RPC execution. Writes without an observed
baseline remain blocked. A newer cloud fetch never rebases them. Confirmed writes
advance only queued local successors; CAS conflicts require explicit recovery.
Retries verify account identity and replay the original operation ID. A bounded
20-scope pass ages attempts so failed earlier documents do not starve later work.

The workspace Local recovery panel offers retry, ZIP export and a new recovery
copy. Copies register a fresh document ID through the normal server ownership and
quota checks, remap annotation/blank-page identities, and retain the original
recovery data. Partial copies are identified as incomplete; failed writes remain
in the new document's outbox. ZIP exports contain retained annotation JSON,
available source PDF and available local audio. Remote audio is not implicitly
downloaded or copied. Annotations in the archive remain inspectable JSON; there is
no general ZIP import workflow in this change.

Raw drawing/text/image/blank-page snapshots are captured before deferred saves.
Snapshots have separate document/kind/tab keys, preserving concurrent tab variants
in the archive; a recovery copy selects the latest retained local snapshot for a
scope. Outbox entries use separate immutable IDs so sibling tab writes cannot
erase each other's payload. Concurrent tabs may conservatively conflict and need
recovery rather than being merged automatically. Source PDF access and audio
backup use account-scoped IndexedDB. Audio has an explicit export button and
indicates whether upload has been confirmed.

Document removal retains local snapshots and available audio before requesting
server deletion, waits for confirmation, then clears the visible document while
retaining its source PDF. Confirmed tombstones and cancellation markers exclude
original IDs from automatic restoration. Standard logout clears ordinary caches
but retains owner-scoped generation/outbox/recovery data and audio. Another signed
in account does not render or process it. This is intentionally retained user
content on the originating browser, not an encrypted backup or a server archive.

Storage quota/unavailability prevents a write from claiming durable capture and
shows export guidance. The last raw mutation stays in memory where possible.
Closing the tab before a failed IndexedDB backup finishes, browser data deletion,
corruption and device loss remain outside browser durability guarantees. Back up
with export. Server recording compensation is a separate coordinated feature;
these client changes do not establish a durable server audio cleanup worker.
