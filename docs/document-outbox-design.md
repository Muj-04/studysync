# Document outbox implementation design

Deletion wins for the original document ID. Each local write retains its owner,
document generation, collection/page, observed revision, immutable write ID and
payload before remote execution. Missing baselines and CAS/tombstone conflicts
remain recoverable locally; fetching a newer revision never rebases pending work.
Only a confirmed predecessor acknowledgment advances queued successors from the
same editor instance. Baselines are observed per editor, never adopted from a
peer tab or persisted storage after a reload. Durable writes retain an editor ID
so a different tab can safely replay an existing chain. Older entries without an
editor ID remain retryable, but their successors are not automatically rebased.
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

An editor freezes fetch-based baseline changes as soon as a collection is edited,
including raw edits before debounce and restored pending markers. Hydration hooks
may retain those local rows instead of adopting a later successful cloud read;
only that editor's acknowledged writes can advance their revision. The freeze
lasts for the module lifetime. Reloaded or legacy pending work without a proven
baseline may require export or an explicit recovery copy rather than automatic
rebasing. Reopening a clean view after earlier edits can conservatively conflict.

Workspace hydration defers both page baselines and the collection snapshot until
all required reads succeed and React commits the render applying the seeds. Existing cached scopes are
withheld while loading. Cancellation or any failed sibling read cannot certify
those caches. Commit-phase completion admits only remote scopes actually passed through the
adapter to the editor; missing cached pages and bookmarks merged with local-only
marks stay withheld. Empty drawing rows filtered by the adapter do not count as
adopted content. Explicit recovery may therefore be required for edits made while
loading or to cache content absent from the cloud; staged revisions never change
merely because loading later succeeds.

For a newly edited page absent from a successfully adopted collection, the raw
edit captures revision zero from that earlier collection snapshot. A snapshot
adopted after the raw edit cannot manufacture its missing baseline.
