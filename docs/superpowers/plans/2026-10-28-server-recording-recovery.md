# Server recording recovery implementation plan

Goal: durable owner/generation-bound recording operations and a bounded operator-run worker.
Spec: ../../server-recording-recovery-design.md

1. Add failing local SQL regressions for authenticated begin, immutable identity, publication, deletion tombstones, membership/generation revocation and leases. Create CLI migration and implement transactional functions, metadata/storage guards and legacy adoption until green.
2. Add failing worker tests for crash/retry, stale leases, cleanup reference denial and bounded passes. Implement server worker module plus explicit local CLI, no scheduler.
3. Add failing client-adapter tests for begin-before-upload, account/generation binding and fail-closed rollout. Add opt-in adapter and authenticated playback route, preserve legacy behavior with flag off.
4. Exercise disposable PostgreSQL role/concurrent transaction cases, full tests, TypeScript, lint/build. Document rollout/operator commands and residual limitations, then commit for independent review without pushing.
