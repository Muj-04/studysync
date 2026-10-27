# Room and recording lifecycle

Stacked on PR #4. Apply the atomic room-leave migration before deploying the endpoint.

## Changes

- Membership removal and last-member closure use the same room-row lock as joining.
- Nonmembers cannot close an empty room; repeated departures are harmless.
- Paginate stroke history, retain server sequence numbers, upgrade optimistic strokes,
  and replay confirmed drawing order (important for paint/eraser overlap).
- Reconnect reads complete history rather than treating the largest observed sequence
  as proof that every earlier stroke was received.
- Share microphone acquisition/unmount cleanup between recording hooks.
- Stop pending/active microphone resources when leaving a screen.
- Keep study-session IDs local to each effect so stale async completions cannot close
  or clear a newer document's session.

## Verification and limits

17 tests pass, including Postgres membership/role checks, stroke-order convergence,
late microphone permission, and active-recorder cleanup. TypeScript passes.
Before release, test two browsers drawing/erasing simultaneously and reconnecting.
Full canvas replay favors correctness; profile long sessions before optimizing it.
Room blank-page/voice-note missed-event reconciliation and reliable study-time flush
on browser termination remain follow-up work. Navigating away cancels an unfinished
recording; users should stop/save it before leaving.
