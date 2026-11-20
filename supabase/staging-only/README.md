# Staging-only migrations

These three migrations exist in the staging ledger (`xokiiepdpjvqnpzwmbtb`) but were
never committed. They were exported on 2026-11-20 and verified byte-identical by MD5
against `supabase_migrations.schema_migrations.statements`.

They live here, not in `supabase/migrations`, so they are never applied to
production by accident. The application code does not call any function they define;
they only add database-side limits.

| File | What it enforces |
|---|---|
| `20261007120000_free_launch_ai` | 3 AI requests per user per day, plus a global ceiling of 100 provider attempts per day (`reserve_free_ai_request`, service role only). Depends on `reserve_ai_request_v2` (20261007090000). |
| `20261007121000_free_launch_rooms` | Rooms capped at 5 members; one active room per host; 6-hour maximum; room ownership is immutable; room membership only through `join_room_atomic` (direct INSERT/UPDATE on `room_members` is revoked). |
| `20261007122000_free_launch_storage` | Bucket file-size limits; per-file and per-account Storage caps via RESTRICTIVE policies **and** a commit trigger on `storage.objects`; uploader delete of own room recordings. |

If these are adopted for production, `20261120190000_launch_quota_tracked_recordings`
must run after them. Without it, tracked recording uploads (#41, `operations/…`) are
rejected by both the policy and the commit trigger.

Before applying `free_launch_rooms` to production, confirm the deployed client joins
rooms only through `join_room_atomic`.
