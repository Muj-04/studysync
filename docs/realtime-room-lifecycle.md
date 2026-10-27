# Fix realtime lifecycle failures found in staging

Stacked on PR #13. Production remains unchanged.

## Reproduced failures

- Supabase retained a channel while asynchronous removal was pending; reopening its
  topic could attach handlers to an already subscribed channel and throw.
- Resetting connection generations during effect replay allowed stale connection work
  to survive cleanup.
- A cancelled room join could finish its compensating leave after the next mount had
  joined, deleting current membership and causing drawing writes to fail RLS.
- Notification initialization could finish after cleanup; multiple hook instances
  could also share the same cached channel.
- Reading onboarding storage on the initial browser render disagreed with server HTML.

## Changes

- A small realtime lifecycle module coordinates channel disposal by client and topic.
- Room connections keep increasing generations and discard stale asynchronous work.
- A separate membership queue orders joins and compensating leaves for each room.
- Notification effects own unique channels and ignore results after disposal.
- Onboarding storage is read after hydration.
- Include the AGENTS.md block refreshed automatically by Next.js development tooling.

## Verification

- 30 regression tests passed, including channel disposal and membership ordering.
- TypeScript and focused lint for the new lifecycle modules passed.
- Production dependency audit reported zero vulnerabilities.
- Hosted staging with two independent browser contexts passed drawing, erasing,
  offline/reconnect stroke recovery, recording save/track release, and last-member leave.
- Personal PDF rendering/reload retained its ID and made no PDF storage upload.

Browser testing used a local Next.js server connected to isolated hosted staging.
Room PDF sharing retains its existing storage behavior; personal workspace PDFs remain
local. Recording used synthetic browser audio, not a physical microphone. LiveKit
voice chat and real Stripe test-mode flows remain unverified because their staging
credentials are unavailable. No production migration or main merge was performed.
