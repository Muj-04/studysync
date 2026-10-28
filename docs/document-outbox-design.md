# Document outbox implementation design

Deletion wins for the original document ID. Each local write retains its owner,
document generation, collection/page, observed revision, immutable write ID and
payload before remote execution. Missing baselines and CAS/tombstone conflicts
remain recoverable locally; fetching a newer revision never rebases pending work.
Only a confirmed predecessor acknowledgment advances queued local successors.
Delayed acknowledgments remove only the matching write. Retry verifies identity
before each operation and stops on conflict for that collection.

The workspace lists retained writes with retry and export. Export includes scoped
annotation payloads and available source PDF; creating a recovery copy uses a new
ID and the normal ownership/quota registration path. Original pending work remains
until the copy is confirmed or the user explicitly exports/discards it. Owner
journals survive logout without exposing another owner's data. Audio export uses
retained in-tab Blobs; absent uploaded audio is never represented as backed up.

Server generation/tombstone/CAS support is a coordinated rollout requirement.
Browser data cleared by the user or unavailable/quota-exhausted storage cannot
provide durable recovery; failed journal persistence prevents cloud execution and
surfaces export guidance. No hosted migration is applied by this work.
