# Complete deployed-policy review and scoped fixes — November 7

This supersedes the missing-policy and legacy-cleanup-function items in the
previous compatibility report. The owner supplied all 28 policies, 13 distinct
untruncated predicates, and the complete cleanup function body. No raw export or
credentials were committed. No hosted configuration, migration, merge or
production change was performed; Stripe remains deferred.

## Confirmed authorization defects and proposed corrections

1. `pdfs_rooms_select` allowed every authenticated caller to SELECT any object in
   the PDF bucket. PR #43 (893ac73) replaces that permit and adds restrictive
   bounds: the owner retains read/upload/upsert/cleanup; a current member can
   read only the exact registered PDF of an active, unexpired room. The path must
   match the room host and room ID namespace, so forging a room pointer cannot
   share someone else's file or another room's PDF. Membership is established
   before signing in the current room client. Community posts share serialized
   note/drawing content and do not require blanket PDF bucket access.
2. Legacy room-recording SELECT and INSERT policies authorized authenticated
   callers by the `rooms` prefix alone. Revised #41 (b586c81) restricts legacy
   reads to adopted, still-published objects with matching metadata. Personal
   audio is owner-only; room audio requires current active/unexpired membership,
   including legitimate members other than the uploader. Anonymous recording
   reads and orphan/ambiguous paths fail closed. New operation objects continue
   to use the authorized short-lived playback endpoint.
3. The supplied upload predicates are broad, but #41's restrictive INSERT guard
   and final Storage commit trigger already require a tracked operation, correct
   owner and authorized scope. New tests load the deployed broad predicates and
   verify old-path, untracked, cross-account and cross-room uploads are denied.
   Existing independent `launch_upload_limit` is retained; its denial still wins.
4. `clear_own_recording_metadata()` is a postgres-owned definer routine that checks
   auth.uid and deletes caller-owned metadata. This is not cross-account deletion
   by its body, but it ignores pending operations and could acknowledge a clear
   while they later publish. No current client calls it. Revised #41 revokes
   EXECUTE from PUBLIC/anon/authenticated/service_role; old clients fail explicitly
   rather than falsely acknowledging lifecycle completion. Supported cancellation
   RPCs/worker continue to own durable deletion. DB-owner maintenance is separate.
5. Reported document TRUNCATE grants bypass RLS and row deletion/tombstone triggers.
   #40 already revoked them; #43 additionally revokes them independently, allowing
   this security correction before the generation rollout if separately approved.
   Real SQL tests deny all three API roles. No hosted destructive test or reachable
   PostgREST TRUNCATE endpoint was claimed.

The PDF/room read predicates are demonstrated authorization defects, not a claim
that we downloaded another user's hosted files. Bucket privacy and provider
behavior still require hosted verification.

## Design, compatibility and rollback

PR #43 depends on the existing room schema, not #40/#41. Its migration aborts if
`pdfs` is missing or public; it never modifies bucket settings. Restrictive bounds
prevent other permissive grants from reopening access; quota policies and other
buckets remain untouched. Owner creation uploads before the room row exists and
upserts remain allowed. Member writes to a host's PDF remain denied.

Legacy recording playback preserves recognized owner/member access. Unrecognized
legacy URLs/objects are preserved but not guessed or exposed. The staging snapshot
contained no recording metadata or objects; verify again before cutover. Existing
signed URLs are bearer capabilities: changing these policies does not invalidate
already-issued tokens or erase previously downloaded bytes. The room PDF client
requests one-hour URLs; old recording clients requested much longer URLs. Assess
actual issued-token exposure/expiry through an approved provider procedure; do
not disable safeguards or rotate credentials without approval.

All migration files are transactional, but separately committed. Apply the
reviewed #40, #41 and #43 files under the deployment hold before activating the
combined client and then the worker. #43 can be a separately approved compatible
security rollout before #40/#41, but this report authorizes neither option. If a
migration fails, inspect rollback/ledger and preserve existing content. After a
successful security migration prefer a forward correction; restoring broad reads
or regranting the obsolete clear RPC is not an acceptable availability rollback.

## Validation evidence

- PDF: all six initial regressions failed before the migration; final eight
  targeted cases passed, including preservation of owner/member behavior, room
  revocation/expiry, forged pointer/cross-room denial, deleted identity denial,
  independent quota denial, document truncation and late-failure rollback.
- Recording: four new deployed-policy regressions failed before correction and
  passed after; full #41 suite passed 463 tests, zero failed/skipped.
- Independent PDF and recording reviewers reported no blocking findings. PDF
  review suggestions for cross-room pointers/deleted identities and rollback were
  added and passed. These are SQL/PGlite checks, not Storage HTTP acceptance.
- Actual local PostgreSQL 16.15 ran #40 and #41 with staging-shaped TEXT IDs and
  nonnullable history plus deployed-policy fixtures. Independent-connection
  publication/deletion, cancellation/begin, lease retry, cleanup and tombstone
  checks passed; the obsolete RPC was denied with pending state preserved.
- #43 then applied to that same local database. Owner/member access, membership
  revocation, document TRUNCATE denial and cleanup-RPC denial passed. Local
  pg_dump/pg_restore preserved the PDF guard and revoked privileges. This does
  not validate physical audio-object backup/restore or hosted PostgreSQL 17.11.
- Isolated combined revision dcf5b507292fdd721c4bbfa77b737427ebded760:
  **471 tests passed, zero failed/skipped**; TypeScript passed; lint **0 errors,
  28 existing warnings**; production build passed with recording recovery enabled
  and non-secret localhost Supabase placeholders. Optional provider credentials
  remained unset. No hosted/provider workflow or browser acceptance is implied.
- Final code-revision CI links: [#41](https://github.com/Muj-04/studysync/actions/runs/42406052389)
  and [#43](https://github.com/Muj-04/studysync/actions/runs/42405923990). The standalone
  PDF revision's CI passed 331 tests. Check these exact revisions before approval.

## Remaining approval gates and next action

Run [06-upload-helper-and-pdf-preflight.sql](../staging-export/06-upload-helper-and-pdf-preflight.sql)
in the staging SQL Editor, inspecting returned function source for secrets before
sharing. This one compact script checks PDF bucket privacy, counts nonstandard
active-room PDF paths, and retrieves the deployed `allow_launch_upload` body.
The complete policy predicates invoke that helper; its logic was not in the
export. Tests use an explicitly labeled configurable stand-in solely to prove
independent denial is preserved, not to claim deployed quota compatibility.
Nonstandard existing shared paths must be reconciled before applying #43 rather
than silently breaking legitimate sharing. The script ran successfully locally.

The earlier missing-policy/cleanup-body gates are resolved. Deployed quota helper,
PDF privacy/path compatibility, full untracked migration reconciliation,
entitlement alignment, provider Storage trigger/restore compatibility, Vercel
activation hold, worker executor/authentication and hosted two-account acceptance
remain. Do not merge or apply hosted changes until the relevant staging approval.

## Fixtures

Task-created local databases integrity_recordings and integrity_policy_restore_nov7
were dropped, and the task PostgreSQL cluster was stopped. Synthetic dump/log
evidence remains outside Git under /tmp/studysync-rehearsal-nov2 and
/tmp/studysync-policy-*. No hosted fixtures or user data were created or modified.
