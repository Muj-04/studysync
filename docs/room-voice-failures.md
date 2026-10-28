# Room voice-note failure handling

Recording upload, playback-URL creation, and metadata persistence must all succeed
before the hook reports a shared note. Upload/signing failure no longer inserts an
unplayable metadata row. Save failures retain the recorded Blob in the current tab
and display an explicit alert; this is not durable offline storage or an automatic
retry queue.

Deletion waits for the note's pending save, avoiding resurrection when upload
finishes after a delete request. The hook removes the local note only after the
helper succeeds. Returned storage/database errors now reach the hook instead of
being discarded. Save/delete completions from an unmounted or replaced room do not
notify its replacement view.

## Limits

- Storage and Postgres mutations are separate operations. Signing or metadata
  failure after upload can leave an orphaned object. Automatic rollback is omitted:
  storage upload uses `upsert: true`, so deleting the path could remove an existing
  published object's audio when a caller retries an existing ID.
- Deletion still removes storage before deleting metadata. A later database error
  can leave metadata pointing to removed audio. A transaction/outbox or equivalent
  server-coordinated cleanup is needed to close this gap.
- A zero-row database mutation under RLS is not an explicit API error; this change
  does not add affected-row verification or redesign room note ownership controls.
- Room voice-note title updates and reconnect snapshot reconciliation remain
  separate follow-up work.

`tests/room-voice-failures.test.cjs` exercises upload/signing/database errors,
successful publication, rejected and null save results, save/delete sequencing,
delete failures, and delayed completions after unmount or room replacement. Tests
use local mocks and establish no hosted Supabase, real-microphone, or multi-user
browser acceptance.
