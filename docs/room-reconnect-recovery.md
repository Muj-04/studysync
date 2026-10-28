# Room snapshot recovery

Room voice notes and blank pages now reconcile from authoritative reads on initial load, first Realtime subscription, resubscription, and browser `online` events. Successful empty snapshots remove clean cached rows. Per-row revisions and read tokens preserve events and local edits that arrive during a read, and discard superseded reads. Pending recording/title/delete operations and pending blank-page creation remain protected. Confirmed remote rows release failed-create protection for later snapshots.

Room changes clear the previous room's notes/pages. Account changes invalidate pending reads and leave the room view. Failed reads retain current data, retry once immediately, then wait for another online/subscription trigger. Errors are logged; there is no unlimited retry loop or promise of durable offline blank-page replay.

Snapshot queries request exact counts. A capped result or unknown count is rejected rather than interpreting omitted rows as deletions. Oversized rooms therefore retain existing state until complete pagination with an appropriate consistency policy is implemented. Separate voice and blank reads are not a cross-table transaction. Blank pages remain room-scoped; changing the displayed PDF does not delete their database records.

Local validation: 247 tests passed, TypeScript passed, ESLint had zero errors and 28 existing warnings, and the production build passed using existing public staging configuration. Twenty added regressions cover reconnect, first-subscription recovery, pending edits, late/deleted rows, room/account lifetime invalidation, bounded failures and incomplete snapshots. Hosted Realtime delivery, current database policies, cross-account access and two-user offline/reconnect acceptance were not exercised. No production or provider operation was performed.

An earlier test run failed after the dependency symlink was replaced while tests were still executing (missing modules); a clean `npm ci` and complete rerun produced the passing result above. This was test setup failure, not an application defect.
