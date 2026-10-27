# Follow-up audit — 26 October 2026

## Status of all seven requested areas

| Area | Checked result | Remaining work |
| --- | --- | --- |
| Production security | Read-only inspection confirms the three statistics functions still run as owner and remain executable by anon/authenticated. Staging has the tested correction. | Production rollout after backup/release gates; production is not yet fixed. |
| Database consistency | Retrieved exact history for all three staging-only free-launch migrations; saved `staging-extra-migrations-2026-10-26.json`. | Decide plan-based versus free-launch limits, then reconcile and test. No blind production replay. |
| Privileged functions | Inspected all 17 client-executable security-definer functions on staging. Reproduced search email disclosure; fixed and verified. Restricted maintenance RPC grants. | Legacy room leave requires further concurrency evaluation; remaining advisor findings described below. |
| User flows | Found/fixed stale pinch tool handling and delayed LiveKit joins surviving leave/unmount. Regression suite now 50/50; prior local Chromium login smoke passed. | Full authenticated two-device notes/chat/room/recording tests and physical audio acceptance remain incomplete. |
| Stripe | Four billing tests passed; code authenticates checkout, deduplicates attempts, verifies webhook signatures and fails on failed entitlement writes. | Real test-mode checkout/webhook/portal, portal settings and price mapping cannot be verified without provider access. |
| Lint | Rechecked entire repository: initially 69 errors/1,612 warnings; now 63 errors/50 warnings. Fixed confirmed stale listener and test loader variable; ignored only copied PDF worker artifact. | Remaining React issues and seven explicit-any errors need targeted changes. |
| Backup/deployment | Latest existing PR14 GitHub check and Vercel preview were green. No Vercel/Stripe tools or provider credentials available in this terminal. | Recoverable production backup, Storage object backup, restore rehearsal, deployment environment configuration and final rollout remain unverified. |

## New fixes and evidence

- `useVoiceChat`: generation invalidation prevents an obsolete token/connect
  operation or room callback from reviving a disconnected room. Cleanup applies
  to leave, immediate disconnect, unmount, and room/user changes. Five behavioral
  regression cases pass. Before the fix, a pending token response after unmount
  caused one connect and one microphone enable, with no disconnect.
- `BlankPageCanvas`: the pinch effect now tracks the selected tool. The real
  touch handler regression fails before the fix and passes after a pen → cursor
  → pen transition with the same zoom callback.
- `search_users`: a hosted synthetic-user test failed because username search
  returned another account's email. The function now searches public username/
  handle and returns an empty legacy email field, preserving its return shape.
  Email-address search is intentionally removed. The hosted privacy test passes.
- `close_expired_rooms` and `delete_user_account`: execution now belongs to the
  service role, not anonymous or ordinary authenticated callers. Account deletion
  already checked service-role identity internally; its grant change is additional
  protection. No browser callsite for either maintenance RPC was found.
- New migration `20261026220801_harden_legacy_public_rpcs.sql` was applied to
  staging as hosted version `20261026220906`. The release manifest includes all
  thirteen reviewed October migrations. Production was not changed.

All test accounts from the privacy checks rolled back. A separate legacy-room
concurrency fixture was explicitly removed, with zero remaining fixture users.
Independent review found no high/medium defect in these changes. TypeScript and
scoped lint and the production build passed. Tests are evidence of simulated provider lifecycle behavior,
not proof of real microphone, network or Stripe behavior.

## Database differences are product differences

Current app plans offer Free/Premium/Pro AI allowances of 15/300/1000 requests per
month and voice storage of 30 MB/1 GB/5 GB. Pro/VIP room capacity reaches 20.
Staging's extra migrations instead impose:

- A separate three-per-day AI reservation function and 100-attempt global daily
  budget. The current app calls `reserve_ai_request_v2` rather than
  `reserve_free_ai_request`, so the extra daily/global budget does not govern its
  AI route.
- A five-member room maximum, one active room per host, and six-hour expiry.
- A 30 MB voice-storage aggregate cap for all accounts, with 10 MB recording
  and 20 MB PDF upload limits, plus additional upload ownership checks.

Consequently, paying/VIP users can hit limits inconsistent with the app UI.
The user has been asked which product policy to preserve. The exact statements
are archived as JSON evidence outside `supabase/migrations`, avoiding accidental
deployment of an unresolved policy choice.

## Security advisor assessment

After the new migration, staging reports six RLS-without-policy informational
findings, ten anonymous and fourteen authenticated security-definer execution
findings. Counts overlap and are not counts of exploitable vulnerabilities.

- The six policy-free service tables intentionally deny ordinary clients.
- Four functions are triggers, not directly usable ordinary RPCs.
- Referral count, recording paths/bytes and upload wrappers scope access to
  `auth.uid()`; invitation/join functions check caller membership/invitations.
- Mutual-friend counts derive the caller's own graph; post-like changes use the
  caller ID. These checks did not reveal another account-identity bypass.
- The legacy single-argument room-leave function lacks the explicit room-row
  lock used by the newer service endpoint. A two-connection check in this run
  left the room active with its joining member; it did **not** reproduce the
  suspected race. Treat it as an unresolved concurrency concern, not a proven
  failure or a fixed item. Its callers must be reconciled before removing it.

## Remaining lint work

The 63 authored errors comprise 27 effect state updates, 20 ref accesses, eight
immutability findings, seven explicit-any types and one memoization finding.
Largest groups: workspace (19), PDFWithDrawing (10), SidebarThumbnails (9), and
VoiceNoteList (8). The deferred workspace callbacks flagged for declaration order
are not demonstrated temporal-dead-zone crashes. Avoid blanket rule suppression;
separate render-state/imperative ref ownership and test each behavior change.

## Release restrictions

Do not merge intermediate stacked PRs or deploy production from this audit.
Production still needs its security fixes; that urgency does not substitute for
an actual backup/restore check. Missing credentials/configuration were checked
by presence only; no secrets were copied into this report. A passing Vercel
preview establishes deployment success, not provider configuration correctness.
