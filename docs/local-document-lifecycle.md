# Local document lifecycle

Stacked on PR #2; review and merge that PR first.

## Changes

- Save filename and content fingerprint alongside each PDF in user-scoped IndexedDB.
- Use content/account identity for new PDFs; preserve IDs of matching legacy local files.
- Different PDFs with the same filename no longer overwrite each other.
- Cloud metadata upserts use document IDs, never filename matching.
- Library reopens explicitly carry the selected document ID, retaining existing annotations.
- Room PDFs use an ephemeral hook mode and do not touch personal PDF blobs.
- Library deletion removes local blobs/caches and reports failed remote cleanup.

## Verification

10 tests pass, including IndexedDB owner isolation, metadata roundtrip, deletion,
legacy identity, filename collisions, renamed-file identity, and explicit reopen.
TypeScript passes. No PDFs are uploaded to Supabase. No production data was changed.

## Limits / staging checks

Legacy documents on another device should be reopened through Library to retain their
old random IDs. New imports use stable content/account IDs. Verify imports, logout/login,
Library reopen and deletion, and room switching in a browser before release.
Deletion across database rows and audio storage is not a distributed transaction;
failures are reported and can be retried. An already-open second browser tab can still
have stale in-memory state; durable cross-device deletion tombstones remain follow-up work.
