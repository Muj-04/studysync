# StudySync overnight QA handoff — 28 October 2026

> This section records the overnight snapshot. The final independent review and authorized dev integration are recorded below. Production authorization remains excluded.

## State and boundaries

Continued the authorized audit after the first report. No PR was merged, neither `dev` nor `main` was pushed directly, no production setting/data/infrastructure changed, and no paid operation occurred. Stripe acceptance remains deferred. Existing worktrees were preserved. All fix PRs target `dev`.

Fresh remote checks still place `dev` at `179d789031c9fa4410197fc90a2c85cd63629e0c` and `main` at `0b28bd297b4b05e1b7f1878bda5667c413f76f81`. PR #21 remains open. The [27 October audit](qa-audit-2026-10-27.md) is a historical snapshot; this handoff supersedes its final-head/test counts and title-synchronization finding.

## PRs and validation

All implemented defects have concrete local reproductions, failing-before/passing-after regression evidence, and independent review. Counts below are individual branch suites, not additive totals.

| PR | Change | Final branch head | Local tests |
| --- | --- | --- | --- |
| [#22](https://github.com/Muj-04/studysync/pull/22) | Deny new voice tokens for ended rooms | `79e806f` | 137 |
| [#23](https://github.com/Muj-04/studysync/pull/23) | Preserve unsynced drawings; order clears | `566ea8c` | 144 |
| [#24](https://github.com/Muj-04/studysync/pull/24) | Recording failure feedback and save/delete ordering | `75beee3` | 149 |
| [#25](https://github.com/Muj-04/studysync/pull/25) | Recover callback setup failure | `0999ef3` | 143 |
| [#26](https://github.com/Muj-04/studysync/pull/26) | Ignore obsolete Community feed responses | `2590a6b` | 139 |
| [#27](https://github.com/Muj-04/studysync/pull/27) | Safe annotation hydration, failed-read handling and stale-bookmark guard | `00eaca3` | 152 |
| [#28](https://github.com/Muj-04/studysync/pull/28) | Audit evidence and this handoff | Documentation | — |
| [#29](https://github.com/Muj-04/studysync/pull/29) | Optional remembered-email storage cannot block successful login | `72faebf` | 138 |
| [#30](https://github.com/Muj-04/studysync/pull/30) | Retain unsynced image edits/deletions during hydration | `40870e4` | 143 |
| [#31](https://github.com/Muj-04/studysync/pull/31) | Persist/synchronize room recording titles; fence delayed fetches | `8990d56` | 153 |
| [#32](https://github.com/Muj-04/studysync/pull/32) | Reject apparently successful partial exports on read failures | `f01bd87` | 144 |
| [#33](https://github.com/Muj-04/studysync/pull/33) | Preserve message drafts and release Send after failure | `4624c58` | 140 |
| [#34](https://github.com/Muj-04/studysync/pull/34) | Repeated flashcard reviews use acknowledged schedules; retry failures | `22b6f24` | 139 |

Local TypeScript checks passed for every changed branch. Combined ESLint passes with **0 errors / 28 pre-existing warnings**. #31's scoped lint included four unchanged RoomClient warnings; the complete combined lint covers that branch too.

Combined unpublished code commit: **`490f763724ed0379bff2271a954ff46745aab859`**, branch `qa/unpublished-audit-integration`, worktree `/tmp/studysync-qa-current`.

- `npm test`: **225 passed**, 0 failed/cancelled/skipped/todo.
- `npx tsc --noEmit --incremental false`: passed.
- `npm run lint`: passed, 28 warnings.
- `npm run build`: passed using the verified staging hostname and existing public configuration.
- `git diff --check`: passed.
- No dependency changes; preceding audit reported zero known npm vulnerabilities. This is not a new vulnerability scan date.

All code commits combined without conflicts. Later #33/#34 commits add only screenshots; their code is included in the tested integration. No integrated Preview was deployed. Individual Preview deployments result from opening the authorized PRs.

GitHub CI and Vercel Preview checks passed for every final fix head listed above (#22–#27 and #29–#34). The documentation-only #28 revision is monitored separately after this handoff is committed. A transient GitHub rejection on the first flashcard push was resolved by a normal retry; no force-push occurred.

## Dependencies and rollback

- Integrate #23 with #27: #27 removes pending drawing markers when deleting documents.
- Integrate #30 with #27's obsolete-workspace-response protection.
- #24 and #31 address different recording operations and combine without conflict; validate them together (covered by the integration run).
- Other fixes build independently against dev. No new migrations or provider configuration required. Roll back a fix by reverting its commits; older code ignores extra local pending-key entries.
- Production rollout remains unauthorized. PR readiness is not production-release approval.

## New reproduction evidence

- Login: remembered-email write/removal throws after successful auth; previously navigation never occurred. Two actual page-handler regressions now pass.
- Text/bookmarks: service read error was converted to an empty cloud result; workspace then attempted stale local-only uploads. Real service and actual workspace callback tests now reject before writes.
- Bookmarks: a successful old fetch returned a mark after a local deletion. Same-document versioning suppresses that stale result; fresh subsequent reads and unrelated documents still work.
- Images: failed writes/removals and late debounce hydration replaced local intent; actual service errors were swallowed. Pending markers/current-job acknowledgments preserve local state across remount.
- Chat: rejected sends lost drafts/stuck busy, while returned-null failures overwrote newer draft text. Tests cover rejection, retry, newer text, and conversation changes.
- Room titles: returned error/zero-row update looked successful, no UPDATE subscription, and stale fetch could overwrite/delete ordering. Seventeen local regressions cover persistence, serialization, cancellation, peer metadata and fetch failure retry.
- Exports: each failed collection query became an empty array in a downloaded payload. Tests prove failure prevents Blob/download, clears loading, and allows retry.
- Flashcards: two Good ratings reused the original card, writing count1/interval1 twice. The corrected writes are count1/interval1 then count2/interval2. Primary failure remains retryable; secondary deck-timestamp failure cannot invalidate an acknowledged review.

## Coverage and blocked checks

| Area | Evidence in this continuation | Limit |
| --- | --- | --- |
| Auth preferences | Static + actual handler regression | No new real signup/login/reset/token replay |
| Annotation persistence | Static + real hooks/services + deferred callback tests | No hosted offline/online or cross-device browser test |
| Chat and room titles | Static + component/hook/service regressions | No messages sent, two-user room or real Realtime delivery |
| Flashcards/export | Static + actual component/service tests | No real account export or hosted review writes |
| Visible error states | Desktop/mobile synthetic component screenshots for chat/flashcards | Actual component markup/state with controlled data; not authenticated application E2E |
| APIs/billing/account deletion | Additional static review; previous automated suite rerun | Stripe provider acceptance deferred; checkout/deletion timing is unverified |
| Hosted schema/RLS/provider behavior | Blocked by access/provider setup | Fresh bounded checks during handoff again returned Supabase `Unknown tool` and Preview HTTP302 to Vercel SSO. No controls disabled |
| Native/mobile-device, screen reader, large-file profiling | Not inspected in this continuation | No load/stress/device testing |

Owner-verified CAPTCHA rejection, legitimate login, redirects, password reset and PDF persistence remain accepted prior evidence. Do not repeatedly request those checks or represent mocks as fresh provider acceptance.

## Unresolved findings and next work

1. **P2, reproduced locally — referral retry is lost on HTTP503.** `processReferral` ignores HTTP results and catches transport errors, returning success-like void; login and callback remove the pending code anyway. Reproducer: `/tmp/studysync-referral-503-repro.cjs`, real helper plus extracted login handler with all fetches intercepted. Next change should return explicit terminal/retryable outcome and clear pending storage only on confirmed completion, preserving optional/nonblocking sign-in. Coordinate with #25 callback cancellation. No real referral/provider call occurred.
2. **P2, code-path evidence — reconnect snapshots remain incomplete.** Room reconnect reconciles strokes, not missed voice-note/blank-page snapshots. #31 now synchronizes live title UPDATE events, but does not fix events missed while offline.
3. **P2, failure-path evidence — storage/metadata are non-atomic.** Recording signing/metadata failure after upload can leave an orphan; DB-delete failure after object removal can leave broken metadata. Reliable coordinated cleanup/idempotency remains separate; blind deletion after an upsert can remove previously published audio.
4. **P2, static reconciliation evidence — remote-absent text pages remain ambiguous.** Failed reads now reject, but a successful cloud result missing a page still triggers legacy local-only text upload. A deleted remote page can be restored from a stale cache. Distinguish clean synced state, new local content and remote deletion before redesigning this path.
5. **P2, reliability limits — no complete durable offline/cross-device merge.** Drawing/blank/image markers preserve intent without automatic replay. Bookmark in-flight guarding does not provide durable failed-delete replay. Room audio retained after failure lasts only in the tab. Concurrent device flashcard review updates are not transactional increments.
6. **P3 / unverified limits — export completeness and maintainability.** Export still covers its existing five metadata collections, has no pagination/snapshot consistency, and is not a full backup. Hosted row-cap behavior was not exercised. Existing lint warnings, large components and Android debug configuration remain.

No P0 or new cross-account compromise was demonstrated. Existing issued LiveKit tokens/long-lived audio URL revocation, distributed AI throttling, referral collisions and backup/restore remain policy or release gates. A completed checkout awaiting webhook during account deletion is an unverified timing risk; Stripe remains deferred, so no live cancellation experiment or speculative billing change was made.

Additional unconfirmed follow-up: Settings sign-out does not inspect the returned Auth error before local cache cleanup, unlike AvatarDropdown. Reproduce a real SDK error result before assigning severity or changing the session/cache policy. Restricted-storage behavior in registration and other optional preferences was not certified by the login-only fix.

## Release gates

Still required before an authorized production rollout: backup/restore and migration reconciliation, entitlement-policy alignment, provider-specific acceptance for enabled Stripe/LiveKit features, and hosted two-account isolation/collaboration acceptance. Keep Android on its separate unverified release track. PR #21 is open; do not assume its documentation is merged. All original boundaries remain in force.

## Fixtures, cleanup and resumption

**External fixtures remaining: none.** No staging accounts, emails, invitations, documents, audio objects, payments or production data were created or changed. All tests used local synthetic fixtures; PGlite databases are ephemeral. Screenshot browser contexts closed. No new application server was started during this continuation; previous test servers were already stopped. Test scripts/logs/screenshots remain locally as evidence, not live accounts.

Retained worktrees: original `/home/mujahed_dev/studysync` and historical worktrees untouched; current PR worktrees under `/tmp/studysync-qa-*` retained for review. Use `git worktree list` rather than recreating or deleting them. Git author was supplied per commit; no global identity/configuration was changed.

Useful evidence:

- Combined logs: `/tmp/studysync-overnight-integration-{tests,tsc,lint,build}.log`.
- Login/flashcard red-green logs: `/tmp/studysync-overnight-login-*.log`, `/tmp/studysync-overnight-flashcards-*.log`.
- Image/read/bookmark evidence: `/tmp/images-*.log`, `/tmp/bookmarks-*.log`; committed tests are the durable source of truth.
- Component screenshots: `docs/qa/` on #33/#34 branches, linked from PR descriptions; capture script `/tmp/studysync-overnight-component-shots.cjs`.

To resume: fetch remote state, check actual PR merge/status before editing, preserve existing changes, use the unpublished integration only as local verification evidence, and start with the unresolved items above. Do not merge or modify production without separate authorization.

## Final review and dev integration — 28 October 2026

The owner subsequently authorized merging reviewed, passing PRs #21–#34 into **dev only**. The overnight no-merge statements above describe completed historical work, not the current authorization.

### Reconciliation of test counts and resolved findings

- The first integration (`874b665`) had 179 passing tests from #22–#27. The overnight integration (`490f763`) had 225: five further #27 tests plus #29 (2), #30 (7), #31 (17), #32 (8), #33 (4), and #34 (3), totaling 46 additional tests. Branch suite totals share the original 136 tests and must not be added together.
- #31 resolves live peer voice-note title synchronization, acknowledged title updates and delayed metadata ordering. It does **not** reconcile events missed while disconnected; that separate issue remains listed above.
- Later #27 revisions resolve failed text/bookmark reads being treated as successful empty snapshots and in-flight bookmark reads restoring a local removal. Successful remote-absent text-page reconciliation and durable failed-delete replay remain separate limits.
- #29, #30, #32, #33 and #34 resolve the login preference, image hydration, partial-export error, chat-send recovery and repeated-review schedule defects described above.
- #21 now recognizes prior owner CAPTCHA login acceptance and the verified redirects, rather than requesting those already-completed checks again.

### Independent review follow-ups

Three reviewers inspected every final code PR diff and its tests, including combined #23/#27/#30 persistence and #24/#31 recording behavior. A separate reviewer cleared the follow-up corrections and documentation.

- #27 at `8c14271`: fixed an introduced replay-versus-hydration race. After a recovered edit saves successfully, a stale initial fetch can no longer overwrite it. The regression failed before correction and passed after; a subsequent clean mount still receives newer cloud notes. Final individual suite: 153 tests; TypeScript passed; lint 0 errors / 28 warnings.
- #34 at `ca0d189`: now requires a returned flashcard row before acknowledging a review. Deleted/hidden rows produce retryable failure instead of false success. Regression failed before correction and passed after. Final individual suite: 140 tests; TypeScript passed; lint 0 errors / 28 warnings.
- No remaining important introduced findings were identified in the reviewed fixes. Existing limitations remain: pending-upload recording rename can fail visibly and require retry; initial room snapshots can race live events; reconnect lacks voice/blank snapshots. These are not claims of hosted acceptance.

### Final combined validation

Tested integration `3827a5818de0b9b190254d1f4f5c9f1fc2768a57` is based on freshly fetched `origin/dev` (`179d789`) and includes all final code heads and #21 documentation. #28's subsequent edits are documentation only.

| Check | Final result |
| --- | --- |
| `npm ci` | Passed; 0 known vulnerabilities; existing OpenTelemetry deprecation warning |
| `npm test` | **227 passed**, 0 failed/cancelled/skipped/todo (225 overnight + 2 review regressions) |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run lint` | Passed; 0 errors / 28 existing warnings |
| `npm run build` | Passed with verified public staging hostname |
| `git diff --check` | Passed |
| Local Chromium public/protected routes | 12 public renders and 18 protected redirects across desktop/mobile; 0 page exceptions or horizontal overflows |
| Local Chromium callback failure/retry | Passed at 1440px and 390px; keyboard retry, destination retained, no duplicate exchange or page exceptions; intercepted synthetic provider responses |

Local build warns that Anthropic, Stripe and service-role credentials are absent. Those provider operations were not exercised. Browser checks establish local application behavior, not hosted authenticated workflows. All final code heads and #21 passed GitHub `checks` and Vercel Preview before normal PR merges; branch protections were not bypassed.

Logs: `/tmp/studysync-review-final-{tests,tsc,lint,build}.log`, `/tmp/studysync-review-browser-{public,callback}.log`. Integration worktree: `/tmp/studysync-reviewed-integration`.

No production rollout is authorized.

### Authorized merge outcome

Merged through normal GitHub PR merges into dev, in order: #22, #23, #27, #30, #24, #31, #25, #29, #26, #32, #33, #34, then #21. The resulting code/release-checklist commit is **`9fad5defd323d051f77c204c442efa18ec60c29a`**. Its entire tree matches tested integration `3827a581` except for the two #28 audit documents being finalized here. No important review finding remains open on these PRs. #28 is the final documentation merge and its final dev/Preview verification is reported with the completion message; it cannot embed its own future merge hash.

Production `main` remains **`0b28bd297b4b05e1b7f1878bda5667c413f76f81`**. No production service, Auth setting, data, migration or deployment was changed. Stripe acceptance remains deferred. Hosted protected Preview and two-account provider acceptance remain unclaimed. The existing release blockers above still apply; dev integration is not production approval.

**Cleanup:** no external fixtures were created. Local browser contexts closed and this run's application server on port 3127 stopped. Audit scripts/logs and isolated worktrees remain as review evidence. Unrelated worktrees were preserved.
