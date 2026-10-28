# Room voice-note titles

Renaming a recording now requires an acknowledged database update before changing
the displayed title. Database errors, signed-out callers, and zero affected rows
(including ownership/RLS denial) are reported. Renames to the same note are queued
in request order so a slower earlier write cannot overwrite a newer write.
Queued writes are skipped after the room view is replaced or unmounted; already
sent requests cannot be cancelled. Failed writes do not block later edits.

Room realtime now listens for persisted voice-note UPDATE events and refetches
metadata through the existing room-scoped query. Existing local notes receive the
new title without replacing their playable audio Blob or URL. A per-note request
token prevents late metadata fetches from undoing newer titles or resurrecting a
note after a DELETE event. Leaving the room invalidates pending fetch results. Rejected background fetches
are contained, retain the current view, and allow the next update to retry.

`tests/room-voice-titles.test.cjs` covers persistence errors, affected-row checks,
rename ordering and failure recovery, title clearing, replacement/unmount
lifetimes, UPDATE subscription delivery, and competing metadata callbacks. The
RoomClient callback tests execute extracted source; they do not claim browser,
DOM, actual React scheduling, real microphone, or hosted realtime acceptance.

This change does not reconcile events missed during a realtime disconnection,
coordinate simultaneous writes from multiple devices, or change upload/deletion
storage atomicity. The title sections are separate from the recording-upload and
deletion failure changes so they can be reviewed independently.
