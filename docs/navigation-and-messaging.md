# Navigation, messaging, and exports

Stacked on PR #8. No additional database migration is required by this PR.

## Changes

- Extract conversation queries/read receipts into `supabase/messages` and history
  loading/pagination into `useConversationHistory`.
- Fetch newest messages first, display chronologically, load older history on demand,
  preserve scroll position, and mark only fetched/displayed message IDs as read.
- Refresh friend unread counts from the database after reading a page.
- Share protected-route and development-origin definitions between proxy and Next config.
- Add flashcards/study-rooms to shared protection/cache headers and allow Android's
  emulator origin only in development.
- Preserve validated same-origin return paths for password and Google login.
- Use local sign-out when canceling a device-session conflict.
- Export note headings in the real PDF/blank-page order.
- Stop claiming a payment/upgrade is confirmed solely from URL query parameters.

## Verification

23 regression tests pass across the stack; new cases cover origin boundaries, safe
return paths, blank-page export ordering, recent-history sorting and scoped read receipts.
TypeScript passes. Verify long chat histories, OAuth callback allowlisting, and Android
API calls on the actual deployment/device before release.

## Remaining items requiring separate work

- Full production schema/RLS/trigger/cron export and staging verification.
- Stripe test-mode validation and a configured price catalog for portal plan changes.
- Referral reward expiry scheduling and reconciliation with paid subscriptions.
- Cross-device deletion tombstones and durable offline save retries.
- Room blank-page/voice-note missed-event recovery and reliable study-time finalization.
- Existing repository-wide lint debt and five development-only audit findings.
- PPTX is still unfinished. Existing uncommitted text-highlight work was preserved and
  intentionally excluded from this PR stack; its persistence needs a separate review.
- Cloudflare Pages preview failures need the integration's build logs/configuration.

The fixes are intentionally split into reviewable modules and PRs. No broad visual
redesign, production database migration, or merge to main was performed.
