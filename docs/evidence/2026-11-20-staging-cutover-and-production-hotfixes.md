# 2026-11-20: production security hotfixes, staging cutover, production release plan

Supersedes the "no hosted changes performed" status in `staging-integrity-rollout.md`
for the items below. The Supabase connector now works (list/execute/apply), so the
earlier `Unknown tool` gap is closed.

## 1. Production hotfixes (`mlyvadsznvyurjakovau`), applied and verified

| Hosted version | Change |
|---|---|
| `20261120174723` | `search_users` no longer reads `auth.users`/returns email; `get_study_*` return data only for `auth.uid()`; `toggle_post_like` requires auth; anon EXECUTE revoked from every SECURITY DEFINER function; trigger and cron-only functions not API-callable. |
| `20261120175341` | #43 `constrain_pdf_storage_sharing`, unchanged body (alias of `20261107191733`). **Do not replay on production.** |
| `20261120175344` | Room recordings (`voice-notes/rooms/<room>/…`) readable/uploadable only by current room members; uploads also need an active room. |

Verification used rolled-back transactions that impersonated each of the 14 real users:
- 0 foreign PDFs visible (previously all 82 to everyone)
- room guest: 0 → 1 PDF after joining; outsider recording upload denied by RLS
- no emails returned by search
- other users' study stats empty
- anon SECURITY DEFINER advisor warnings 12 → 0

Applied with 0 active rooms. Recorded in git via #44 and redeployed (no app change).

Residual: legacy room recordings keep 10-year signed URLs in `room_voice_notes.audio_url`
(bearer links). `room_members` is readable by every signed-in user.

## 2. Staging cutover (`xokiiepdpjvqnpzwmbtb`), complete

Preflight (`staging-export/06`): pdfs/voice-notes private, versioning DISABLED, 0 active
rooms, empty TEXT-ID recording tables, `storage.allow_only_operation` present.

**Defect found before applying:** staging's untracked free-launch quota
(`launch_upload_limit`, RESTRICTIVE) admitted only `<uid>/…` and `rooms/<room>/…`
voice paths. #41 uploads to `operations/<id>/audio.<ext>`, so every tracked upload
would have been rejected. The local fixture stubbed `allow_launch_upload` to `true`,
which hid it. Fix: `20261120190000_launch_quota_tracked_recordings.sql` (no-op where
the helper is absent) plus a fixture that loads the deployed helper verbatim. Real
PostgreSQL 16: without the fix the first upload fails on `launch_upload_limit`; with it
all recording and document-generation PostgreSQL suites pass; `npm test` 463/463.

Applied in order: #43 (`constrain_pdf_storage_sharing`), the launch-quota fix (MCP),
then `20261028202847` and `20261028203014` (owner, SQL Editor; ledger rows inserted
afterwards). Hosted checks: `documents.generation`, `document_lifetimes`,
`recording_private.operations`, UUID recording IDs, commit guard trigger, 9 recording
Storage policies, `begin_recording_operation` authenticated-only, obsolete clear RPC
locked, documents TRUNCATE revoked.

Hosted end-to-end check (rolled-back transaction as the staging user, `storage.operation=object.upload`):
begin → `awaiting_upload`; tracked upload allowed; forged `operations/` path denied;
old-style direct upload denied; confirm → `published`.

Then: `NEXT_PUBLIC_SERVER_RECORDING_RECOVERY=true` for Preview scoped to `dev`; merged #41
(contains #40, so no intermediate document-only build), #43, #42. Dev preview
`c669266e` READY, CI green, no runtime errors in the following hour. Two-account
browser acceptance and worker scheduling are still open.

## 3. Production release: blockers and order

Production is `main` + the hotfixes above. It does **not** have the October migrations,
the free-launch quota, #40 or #41.

Blockers:
1. **#41 aborts on populated TEXT IDs.** Production has 30 `voice_notes` and 17
   `room_voice_notes` rows; all 47 IDs are UUID-shaped, and 7 room rows have no audio.
   A reviewed pre-step (lock, verify UUID shape and no incoming FKs, `ALTER … TYPE
   uuid USING id::uuid`) must be rehearsed locally with populated fixtures, including
   legacy adoption and quarantine, before production.
2. **Backup.** The org is on the Free plan, so there are no downloadable provider backups. Take
   a `pg_dump` (schema+data+auth) and an object-byte manifest/download of `pdfs` (82)
   and `voice-notes` (53) before cutover, and rehearse restore into a disposable project.
3. **Free-launch migrations are not in git.** Staging's three `free_launch_*` ledger
   entries need exporting from `schema_migrations.statements`, review, and a product
   decision on whether production should get those quotas.
4. **Recording worker** has no scheduler; it is needed for recovery and cleanup.
5. Two-account acceptance on the dev preview, per rollout doc §5.

Order once these are cleared:
1. Maintenance window.
2. Backup and verify.
3. October migrations in manifest order (skip `20261107191733`, already applied).
4. Free-launch (if approved) and the launch-quota fix.
5. TEXT→UUID pre-step.
6. #40, then #41.
7. Set `NEXT_PUBLIC_SERVER_RECORDING_RECOVERY=true` for Production.
8. Merge `dev` → `main`.
9. Verify advisors and the end-to-end probe.
10. Enable the worker.
