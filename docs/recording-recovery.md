# Recording recovery

Recording upload, playback URL signing, metadata publication and file deletion are separate requests. Previously, personal recordings could publish null playback URLs after upload failure; room recordings could leave uploaded files without a recovery record; deletion could remove audio before the metadata request failed.

The shared `src/lib/supabase/recordingRecovery.ts` service coordinates personal and room recordings using the existing database schema. It stores account-scoped operation metadata before upload or deletion, serializes each recording's operations within the client, and verifies the initiating account before each subsequent network phase.

## Save and retry

Audio is immutable for a recording ID. Upload uses `upsert: false`; publication uses insert and checks the existing metadata first. A repeated save cannot overwrite published bytes or titles. Failed upload/signing work retains its recovery entry. A successful upload with a lost response can be recovered by signing its existing path, without uploading again.

Before inserting metadata, the journal records that publication was attempted. A lost response is reconciled by reading the row back. A definite PostgreSQL statement rejection permits another attempt. A missing row after an uncertain insertion is ambiguous: the insert may have succeeded and another device may have deleted the recording. Both background recovery and same-ID save retries refuse to recreate the audio or metadata in that case.

After confirmed publication, a compact published marker remains. It prevents an old same-ID save from recreating a recording deleted remotely. Pending entries retain the original title; published and deleted entries omit it.

Relevant recording reads retry at most 20 pending operations, oldest attempt first. Failed or blocked work is aged before queuing so it cannot starve later operations. Local recovery-storage failures remain contained and do not prevent healthy cloud reads; they do prevent new remote mutations that could not be tracked.

Failed uploads still need their audio bytes. Personal and room recording hooks retain the Blob in the current tab, show a failure alert, and retry up to 20 failed saves on the browser's `online` event. Retries retain their original owner, rotate failures, avoid duplicate in-flight saves, and stop after unmount or room change. This is a reconnect retry mechanism, not a general durable audio backup.

## Delete and cleanup

Deletion records its intent, removes metadata first, reads back to confirm absence, then removes the recording's known audio paths. A rejected or uncertain metadata deletion cannot destroy audio while its row still exists. Failed file cleanup keeps its operation record and can retry without recreating metadata. A completed deletion retains a tombstone to reject stale saves in the same client.

Document-wide cleanup combines remote recording IDs with unpublished tracked uploads. It requests an exact count and refuses an incomplete or unknown-count list before deleting anything. It uses the same per-recording metadata-first cleanup. Background publication respects the parent document deletion barrier and never creates a missing parent. Tracked file deletion can run after that barrier closes because cleanup cannot create document data.

Personal and room UI deletion waits for pending saves and remote confirmation. A failed deletion retains local playback and remains retryable. Personal hydration ignores notes already deleted successfully during the current mount.

## Sign-out and ownership

Keys beginning `studysync_recording_recovery_` intentionally survive normal sign-out. Otherwise a completed upload or unfinished cleanup could become untracked. These owner-scoped records contain pending metadata and object paths, including pending titles, but no audio bytes, session tokens or signed playback URLs. Only the same signed-in owner may replay them, and account checks occur between remote phases. Other user caches still clear normally.

## Limits and required server work

This browser journal is not a distributed transaction. User-cleared or corrupted browser storage, a fresh client without its prior markers, concurrent tabs/devices, revoked accounts or room membership, and rows changing during multi-request cleanup still require server-side reconciliation. Room audio bytes remain in the current tab. A metadata-only journal cannot upload missing audio after the tab closes.

An ambiguous prior publication with no row remains tracked but cannot be retried under the same ID. A separate, explicit new-ID recovery-copy action is not provided by this patch. Full resolution needs server tombstones or an operator-assisted recovery workflow; the service must not guess that a missing row was never published.

A durable server design needs an operation table keyed by owner, recording and operation ID, with immutable object path, status and deletion generation; transactional metadata publication/deletion; and a bounded privileged worker to reconcile abandoned uploads and cleanup. Ownership/membership authorization, idempotency constraints, account deletion and access revocation must be designed together. No such migration or hosted provider change is applied here.

Rollback is a code revert, but older code will not process the recovery journal. Preserve pending entries for follow-up reconciliation rather than deleting them during rollback.

## Validation boundary

Local regressions exercise real hooks/services with controlled storage, auth and database boundaries: each failure stage, lost responses, duplicate saves, owner changes, storage denial, delete/save ordering, document deletion barriers, bounded retry fairness, truncated bulk reads, sign-out retention and reconnect Blob retries. These tests do not certify hosted RLS, provider limits or actual multi-device delivery.

Supabase documentation checked: [upload](https://supabase.com/docs/reference/javascript/storage-from-upload), [remove](https://supabase.com/docs/reference/javascript/storage-from-remove). No hosted data, migrations or production configuration changed.
