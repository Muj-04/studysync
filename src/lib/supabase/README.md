# Database service boundaries

`db.ts` is the compatibility entry point. Its 149 public value/type exports remain available; callers can migrate to a domain import independently. Domain modules import one another directly, never through the facade.

- `documents`: metadata, library listing, coordinated document deletion.
- `documentAnnotations`, `annotations`, `voiceNotes`: personal study material. `annotations` retains the atomic collection RPCs.
- `studyActivity`, `flashcards`, `documentOrganization`: progress, review, tags and favorites.
- `rooms`, `roomAnnotations`: room membership/listing and shared material/strokes.
- `community`, `friends`, `directMessages`, `messages`, `notifications`: social data. `messages` retains paginated conversation reads.
- `profiles`, `preferences`, `activeSessions`, `referrals`, `accountData`: account data and settings.
- `search`: cross-domain search.

`dbShared.ts` resolves the existing browser client and owns the single registration cache. Successful registrations are keyed by both account and document; failed registrations are never cached. Document deletion clears all cached owners for that document. `ensureDocument.ts` remains the error-checking parent-row primitive used by both the cached helper and atomic collections.

Personal drawing, image, voice and session writes enter the same `documentQueue` used by atomic collections and document deletion. Queue before authentication; do not nest a queued writer inside another operation for the same document. Deleted/deleting documents reject writes until an explicit successful `upsertDocument` reopens them. Callers must catch rejected background saves.

Audit validation: four regression/contract tests cover failed registration retry, account isolation and shared cache, deletion/reopen barriers for all four writers, and facade identity. Existing deletion-race tests continue to cover active-write draining and pending collection cancellation. The full 92-test suite and TypeScript check pass. All 142 directly declared baseline exports plus seven existing re-exports are preserved.

Scope: no schema, RLS, dependency, credential, production or hosted-data changes. Existing best-effort error handling and upload/signing behavior outside the confirmed registration/lifetime bugs remains unchanged. Mocked local tests cannot establish production RLS correctness or external storage availability.
