# Server-owned recording recovery

## Decision and scope

Replace browser-only coordination for newly created recordings with a durable Postgres operation before any upload. Keep the current client path behind a rollout flag until the migration, playback endpoint and operator-run worker are deployed together. The migration deliberately fails closed for legacy direct uploads/publication; an old browser cannot bypass tombstones. Existing referenced recordings are adopted where their object path can be verified; ambiguous legacy paths are quarantined for operator review, never guessed or deleted.

A browser journal alone cannot recover after storage loss. An external queue would add another transactional boundary. A database operation with fenced leases and a bounded worker is selected: one durable source of truth, no paid service or automatic scheduler.

## Lifecycle and authorization

An operation permanently binds recording UUID, owner, room/document scope, document generation (where applicable), content type/size, immutable object path and initial metadata. IDs cannot be reused after deletion. States are awaiting_upload → published or deleting → deleted; uncertain legacy paths and mismatched uploaded metadata use blocked, retaining bytes for reconciliation. Uploaded bytes are discovered from Storage metadata even when the browser disappears. Valid committed bytes remain recoverable after the upload deadline, including after worker outages or metadata failures. No bytes means no recoverable audio: admission of new uploads expires after one hour, and the local Blob remains available for an explicit export/new copy in the UI.

Authenticated begin/upload/confirm require the initiating owner, live account, current document generation or active room membership. Document publication calls the schema agent's generation assertion while holding the parent lock. Publication and metadata insertion are transactional. Delete request durably wins over publication, removes metadata transactionally and invalidates any publication lease. Metadata guards prevent direct clients from resurrecting deleted operations or changing ownership/path/scope. Existing room contributions remain shared after their author leaves; unpublished contributions are cancelled on membership revocation.

New audio metadata points at an authenticated playback endpoint, not a client-supplied signed URL. The endpoint validates current ownership/membership and creates a short-lived playback redirect using server credentials. Client storage SELECT/UPDATE/DELETE is denied for operation objects; INSERT requires an authorized awaiting operation, locks it against concurrent cancellation and never permits overwrite.

## Worker and failure behavior

A locally runnable worker claims at most 20 eligible operations with SKIP LOCKED, expiring leases and a one-minute pass budget. Every completion checks its lease token. Upload confirmation can also finish synchronously through an authenticated RPC; the worker provides browser-independent recovery. Failed work receives bounded backoff and expired leases can be reclaimed after crash.

Before object cleanup, a transaction checks both recording metadata tables for references and permanently fences publication. Only then does the worker use the Storage API; it never deletes Storage metadata directly. Deleting is monotonic, so a crashed/stale cleanup worker can safely retry the same immutable path. Deleted operation tombstones remain even after object removal. Reference checks and operation guards prevent deletion of live audio.

## Delivery and validation

Create the migration using the Supabase CLI. Use disposable local PostgreSQL for role/RLS, lease/concurrency, revocation, parent-generation, crash/retry and delete-versus-publication tests; controlled Storage doubles exercise worker failures. Add adapter tests proving durable begin precedes upload, account binding, immutable retries, and fail-closed schema/flag behavior. Preserve existing legacy tests with the flag off. Run the full suite, TypeScript, lint and build, then independent review before any push.

No hosted migration, deployment, scheduler, provider mutation, or production authorization is included. Physical Storage behavior still requires hosted acceptance. A worker must actually be operated to provide timely recovery; shipping its source alone does not establish production durability. No worker can reconstruct audio that never reached Storage, and database backups do not replace audio-object backups.
