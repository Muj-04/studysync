# StudySync reliability recovery — 28 October 2026

This continuation starts at freshly fetched dev `7f187efce1f3644e525cfc5c20a62d9e743e80c2` (227 tests; PRs #21–#34 merged). The previous report's 179 and 225 counts were historical integration stages, followed by two independent-review regressions. No new PR is authorized to merge in this continuation. Production main remains `0b28bd297b4b05e1b7f1878bda5667c413f76f81`.

## Focused work

- [#35](https://github.com/Muj-04/studysync/pull/35): stop passive workspace hydration from uploading ambiguous cached text-note pages absent remotely. Actual-effect test failed before correction and passes after; local copy retained. Explicit edits/outbox remain separate. 228 branch tests, TypeScript, lint 0 errors/28 existing warnings, production build passed. Independent review cleared.

- [#36](https://github.com/Muj-04/studysync/pull/36), `493dc92`: reconcile authoritative voice-note and blank-page snapshots on initial subscription, reconnect and online events, with per-ID change/read ordering and pending-work protection. Failed/truncated/unknown-count responses retain local state instead of implying deletion. At most one immediate retry per collection, followed by a future online/subscription trigger. 247 branch tests, TypeScript/build passed, lint 0 errors/28 warnings; GitHub CI and Vercel passed. No hosted Realtime claim. Large/incomplete snapshots intentionally fail closed pending consistent pagination; pending blank-page writes are retained in the tab but not durably replayed by this PR.

- [#37](https://github.com/Muj-04/studysync/pull/37), `4ca9983`: explicit confirmed/retryable/deferred/terminal outcomes; two attempts per trigger with deadlines and cancellation; account-scoped pending referral records survive logout and another account's new link. Actual login/callback failures preserve intent without blocking navigation. Authenticated mount, online and auth events recover work. Existing transactional SQL ensures repeated/lost-response redemption does not grant twice. 249 branch tests, TypeScript/build passed, lint 0 errors/28 warnings; independent 42 focused/SQL tests passed; GitHub CI and Vercel passed. Terminal intent remains stored without automatic retry; explicit new same-account link supersedes it. No new migration.

- [#38](https://github.com/Muj-04/studysync/pull/38), `b54c3a8`: tracked recording recovery, described below. **Depends on #36** and includes its reviewed merge resolution; target remains dev. Standalone frozen recording revision passed 271 tests/TypeScript/build with lint 0 errors/28 warnings; dependent merge passed 98 independently reviewed focused tests and TypeScript. Final combined suite below covers all code together. Final-head GitHub checks and Vercel Preview passed.

## Document conflict policy and durable offline limits

Whole-document deletion is **not fixed** by #35. Current parent upserts can recreate absent rows; an explicit pending annotation write can also recreate its parent. Process-local deletion barriers are not cross-device tombstones. Adding automatic replay for all drawing/image/blank markers would enlarge that failure path, so this continuation does not claim generic durable offline synchronization.

Concrete options are recorded in #35's `docs/document-recovery-policy.md`: (1) deletion wins with local edits retained as an explicit recovery copy, recommended; (2) explicit restore of a new document generation; (3) automatic conflict copies under new IDs. All require server-side tombstones/generation checks, account-bound versioned outboxes and a visible recovery/export path. A client existence preflight cannot close a concurrent delete/insert race. No hosted migration was applied.

## Access and evidence boundaries

A fresh staging Supabase `list_tables` call returned `Unknown tool`. The existing dev Preview for `7f187ef` returned HTTP302 behind deployment protection. This continuation has not deployed its unpublished integration branch. Hosted catalog/migration inspection, real Realtime delivery, Storage policies and two-account workflow checks remain blocked; no controls were disabled. Existing owner CAPTCHA/login/reset/redirect/PDF acceptance remains valid prior evidence and was not repeated.

Local mocks and ephemeral SQL fixtures establish application recovery behavior, not hosted provider acceptance. Stripe remains deferred; no paid operation or production service change occurred.

## Release and cleanup

Production gates remain backup/restore and migration reconciliation, entitlement-policy alignment, hosted isolation/collaboration and affected LiveKit/recording acceptance. Android remains a separate unverified track. No external accounts, emails, invitations, documents, audio objects or payments were created in this continuation. Local evidence and isolated worktrees are retained; unrelated work is preserved.

## Recording recovery review

The recording candidate tracks pending metadata before uploads, uses immutable
(non-overwriting) audio paths per recording ID, reads back uncertain publication,
and deletes metadata before removing audio. Published/deleted markers prevent
same-client stale retries from recreating removed recordings. Pending titles are
retained; audio, tokens and signed URLs are not stored in the recovery journal.
The owner-scoped journal survives logout and is processed only for its owner.

Independent review reproduced and corrected retry starvation, cleanup blocked by
a parent deletion barrier, and optional journal failures blocking healthy reads.
The bounded pass processes at most 20 entries, aging attempts so permanent failures
do not monopolize future triggers. Cleanup can complete after parent deletion;
publication remains blocked. Bulk recording deletion rejects incomplete query
results before side effects. Local audio remains playable on failed deletion and
same-tab uploads retry on online events, with visible failure feedback.

This is a browser recovery journal, not a cross-service transaction or durable
server queue. User-cleared/unavailable browser storage, other clients, lost room
membership, deleted accounts and crashes before the journal is established remain
outside that guarantee. Audio blobs are not journal backups. Ambiguous prior
publication with missing metadata is retained and refused same-ID reinsertion;
a new-copy/export recovery UI and server tombstone policy remain follow-up work.
A server operation table plus authorized cleanup worker is required for recovery
independent of the originating browser. No hosted migration or worker deployment
is authorized or performed here.


## Final integration validation

Unpublished integration branch `qa/recovery-integration`, worktree
`/tmp/studysync-recovery-integration`, code commit
**`19674c670e1296298fe450c2cec8a7997cea5128`** includes #35–#38. The shared
recording/reconnect changes were resolved on #38 itself and independently reviewed,
so this integration then merged cleanly. Both logout journal exemptions remain.

| Check | Result |
| --- | --- |
| `npm ci` | Passed; zero known vulnerabilities, existing OpenTelemetry deprecation warning |
| `npm test` | **314 passed**, 0 failed/cancelled/skipped/todo |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run lint` | Passed, **0 errors / 28 existing warnings** |
| `npm run build` | Passed using verified existing public staging configuration |
| `git diff --check` | Passed |

The count is 227 baseline + 1 cache-hydration regression + 20 reconnect regressions
+ 22 referral regressions + 44 recording regressions. Individual branch suites
share the baseline and must not be added together. Local build warns about absent
Anthropic, Stripe and service-role credentials; no provider operations are certified.

Diagnostic runs were not hidden: an early reconnect run failed after its dependency
symlink was replaced mid-run; the fresh-install rerun passed. Recording review added
failing-before cases for fairness, cleanup barriers and journal quota handling; older
restoration/empty-query fixtures needed to await acknowledged deletion/report exact
counts. Only the final frozen and integrated results above are completion evidence.

Logs: `/tmp/studysync-recovery-final-{tests,tsc,lint,build}.log`;
branch red/green and review logs remain locally. No integration branch was deployed
or pushed. No PR was merged; freshly fetched dev/main still match the commits above.


Local Chromium validation on the final production build passed: 12 public renders
and 18 protected-route redirects at desktop/mobile widths, zero page exceptions or
horizontal overflows. Synthetic callback profile-failure/keyboard-retry checks passed
at 1440px and 390px, preserving the destination without duplicate PKCE exchange.
All provider responses in that callback fixture were intercepted. These browser
checks do not certify real room reconnect or Storage behavior. Logs:
`/tmp/studysync-recovery-browser-{public,callback}.log`.

All four final code PR heads passed GitHub `checks` and Vercel Preview. The handoff
PR changes documentation only and is monitored separately. External fixtures
remaining: **none**. Browser contexts closed; this run's local server on port3127
stopped. Worktrees, test scripts and logs are retained as evidence. Standard logout
now intentionally retains owner-scoped pending referral/recording metadata for
recovery; these are product behavior, not external test fixtures.
