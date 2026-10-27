# Project Audit Implementation Plan

> **For agentic workers:** Use isolated subsystem implementation and independent review before publication.

**Goal:** Review all project subsystems, repair confirmed issues, and separate oversized responsibilities into focused PRs.

**Architecture:** Keep existing exported contracts while extracting domain services and cohesive UI hooks/components. API changes stay in a security-focused PR. Every follow-up depends on the already-tested PR15 baseline.

**Tech Stack:** Next.js 16.4.3, React 19, TypeScript, Supabase, Stripe, LiveKit, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-27-project-audit-design.md`

## Global Constraints

- No new credentials, hosted mutations, production release, or main merge.
- Separate PRs by responsibility; preserve imports/exports and external behavior unless fixing a demonstrated defect.
- No blanket lint suppression or giant replacement catch-all file.

## Review Focus

- Authorization and quota limits at API boundaries; fail without invoking privileged work.
- Document deletion/reopen and account switches; preserve queue identity across module boundaries.
- Async UI work completing after navigation; cancel stale work and release browser resources.
- Existing caller imports/types; compatibility facades must preserve the public API.
- Shared preview credentials and unavailable providers; distinguish code tests from live acceptance.

### Task 1: Database module boundary
- [x] Inventory every exported function/type and shared client/cache in `src/lib/supabase/db.ts`.
- [x] Extract cohesive domains under `src/lib/supabase/`, retaining a compatibility facade.
- [x] Preserve shared singleton registration and deletion coordination. Add an export-contract regression and run persistence/documents/billing/navigation tests plus tsc/lint.
- [x] Review and open a database-only PR.

### Task 2: Workspace boundary
- [x] Extract cohesive state hooks and UI sections from `src/app/(app)/workspace/page.tsx` into its adjacent feature directory.
- [x] Keep React hook ordering and callback/ref lifetimes stable; test changed lifecycle behavior.
- [x] Run workspace lint, typecheck, relevant persistence/drawing/document tests; review and open a workspace-only PR.

### Task 3: API/security audit
- [x] Inspect every route, authorization wrapper, quota/idempotency handler, request validation and error path.
- [x] Reproduce confirmed defects with tests, then fix in small shared helpers where appropriate.
- [x] Review and open an API-only PR; no live provider calls or migrations without a separately established need.

### Task 4: UI/configuration audit
- [x] Inspect settings, room, community, friends, library, hooks, configuration, dependencies and Android integration; inventory coverage.
- [x] Repair confirmed defects and extract suitable cohesive settings/UI sections, retaining behavior.
- [x] Record unresolved issues and external gates; open a separate PR.

### Task 5: Integration verification
- [x] Independently review subsystem diffs and resolve important findings.
- [x] Validate combined changes with tests, TypeScript, lint, dependency audit and local production build.
- [ ] Publish focused PRs with dependencies, validation and material limitations; leave them unmerged.
