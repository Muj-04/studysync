# Project audit — 27 October 2026

## Scope and integration

This review builds on PR #15 (`fix/dev-readiness`). The focused follow-up PRs target that branch to keep their diffs reviewable; retarget them to `dev` after #15 is integrated. They are not a production release. No production deployment, provider credential change, or hosted database mutation was performed during this audit.

| Area | Review and changes |
| --- | --- |
| Database services | Preserved all 149 public exports while splitting `db.ts` from 2,297 lines into a 21-line facade and domain services. Tested registration retries, account identity, deletion barriers, latest session intent, and bulk-delete failure propagation. |
| Workspace | Extracted header/help/sharing/panel controls and ordering/resize hooks. Fixed stale/duplicate document ordering and failed sharing feedback; consume failed background session writes. Page reduced from 3,102 to 2,240 lines. |
| Settings | Split the 1,866-line page into a 166-line page and cohesive sections/controls. Failed email changes are retryable; failed cloud deletion retains local data and shows an error. Export failures release resources and loading state. |
| API routes | Inspected all nine routes, authentication boundaries, quota/refund paths, body validation and error handling. Added streamed byte bounds, strict inputs, safer referral initialization, and client AI truncation matching existing prompt limits. |
| Background hooks | Cancel stale image timers/auth-pending saves and serialize writes; handle drawing/voice/image failures without discarding local data. Prevent Pomodoro updater replay from duplicating completion effects. |
| Browser persistence | Reviewed PDF identity and account scope. An isolated IndexedDB reproduction confirmed users cannot list/read another account's cached PDFs; identical files receive separate account-scoped identities. |
| Other UI | Static review and existing regression coverage for room, community, friends, library, navigation and recording flows. This is not exhaustive browser acceptance testing of every interaction. |
| Configuration and dependencies | Preview credential guard retained. Dependency audit and local production build are part of combined verification. Android configuration was inspected, but no native build/device testing was performed. |

## Review findings resolved across branches

- Session writes queued by document could restore an older document after switching tabs: latest intent and account checks now guard session persistence.
- The new API body bound initially rejected large PDF input before server truncation: the client now applies the same action-specific limits before serialization, with escaped and multibyte payload regressions.
- Cloud bulk-deletion helpers must reject failed provider operations before Settings clears local data. Integrate the database and Settings PRs together for that complete behavior.
- Image writes already dispatched cannot be canceled by a React hook. The database deletion barrier and background-hook changes work together to prevent resurrection after deletion.

## Remaining release gates and limits

- PR #15 is still a prerequisite. Preview deployment settings need isolated staging values; production Supabase credentials must not be reused in Preview. Earlier Vercel deployment of #15 failed, and provider logs were unavailable.
- Real Stripe webhook/checkout and LiveKit recording acceptance require configured staging credentials. Unit tests do not certify those providers.
- Production backup/restore verification and alignment of staging free-launch limits with plan-based UI remain outstanding.
- AI throttling remains process-local and depends on trusted ingress headers. CAPTCHA and application limits do not guarantee protection against a distributed denial-of-service attack.
- Referral code collision recovery and revocation of already-issued LiveKit tokens need separate design work.
- Android currently contains emulator HTTP/debug settings and lacks a verified native release pipeline; it must not be represented as release-ready.
- Workspace and room/PDF/community components still contain substantial code. Further extraction should follow cohesive responsibilities with behavior tests, rather than moving entire pages into another oversized file.

This audit fixes demonstrated issues and improves maintainability; it does not establish that the entire application is defect-free or production-ready.

## Combined local verification

All five branches were merged into an unpublished local integration branch without conflicts. Results: 136/136 tests passed, TypeScript passed, production build passed using public staging configuration, ESLint reported zero errors and 28 warnings, and npm audit reported zero known vulnerabilities. These checks do not replace real provider acceptance or Vercel deployment verification.
