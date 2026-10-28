# Document generation and deletion boundary

Deletion wins for the original document ID. Recovery creates a new ID and goes
through normal ownership and document quota checks. There is no undelete operation.

`documents.generation` is an immutable UUID. A permanent owner-scoped
`document_lifetimes` row records each ID, generation and optional deletion time;
`document_tombstones` is an owner-readable security-invoker view of deleted rows.
IDs and owners cannot be reassigned. A parent insert validates the lifetime after
unique-row conflict resolution, so an old upsert cannot pass an earlier absence
check and recreate a concurrently deleted row. Deletion marks the lifetime in the
same transaction. Lifetime row locking also makes stale repeatable-read writers
fail rather than observe an obsolete generation. Browser roles cannot mutate the
lifetime history; account deletion retains the non-reusable ID boundary.

Document-linked children gain `document_generation`, an owner/generation guard,
and a composite foreign key to the parent. Private annotations/tags/favorites cascade. Community posts, historical study sessions, decks and session pointers detach their nullable document reference and generation, preserving independent content and owner. Existing document FKs are replaced so a legacy cascade cannot delete those retained copies. Nonnullable historical references or unknown linked tables block migration for a reviewed policy. Existing live children are
backfilled. Orphans and owner mismatches fail migration for explicit reconciliation;
no user content is silently dropped. The migration discovers public base tables
with `user_id` plus `document_id` or `doc_id`. Nullable references remain nullable.
Standalone flashcard decks/cards are allowed only through a real matching owned
standalone deck, never merely because an ID has a `deck:` prefix. Direct insert,
upsert, update and delete paths remain covered by triggers and constraints.

`assert_document_generation(p_document_id text, p_generation uuid,
p_owner uuid default auth.uid())` validates the current owner/generation and locks
the parent for the caller transaction. Service-role workers may pass an owner;
authenticated users cannot impersonate another owner. Cleanup deletes may finish
after parent deletion; new publication may not.

The bounded replay collections are text notes, bookmarks, key terms, blank pages,
flashcards, drawings, page images and session state. The old replacement RPC is
disabled. `replace_study_collection_v2(p_collection, p_document_id, p_generation,
p_page_key, p_expected_revision, p_write_id, p_rows)` compares the frozen scope
revision and returns the acknowledged revision. Payload-bound write receipts make
lost-response retries idempotent; reusing a write ID with different input fails.
Authenticated direct INSERT/UPDATE/DELETE (including column grants) on replay tables are revoked: legacy tabs cannot bypass CAS. Narrow owner-authorized RPCs support deck creation, review-count CAS, explicit drawing clear and ephemeral position saves; these advance the same collection revision. Document deletion purges full-payload receipts and revisions; only the immutable identity tombstone remains.
`read_document_collection_v2(p_collection, p_document_id, p_generation)` returns
`{rows, revisions}` from one SQL snapshot; page-scoped keys use page text, whole
collections use the empty key. Conflicts never auto-rebase or overwrite remotely.
Metadata has lifetime guards but no automatic offline metadata replay/CAS.

This requires coordinated migration and client rollout. New child inserts require
an explicit generation; old collection-replacement clients fail closed. No hosted
migration is authorized. Local tests cover backfill, malformed legacy data,
ownership, tombstone immutability, stale direct/RPC writes, quotas, CAS and receipt
binding. Separate PostgreSQL connections test delete/write races and isolation;
PGlite supplies repeatable fast regressions. Provider acceptance remains separate.

The ancillary interfaces are `create_flashcard_deck_v2(p_name, p_description,
p_document_id, p_generation, p_cards, p_expected_owner)` (UUID),
`review_flashcard_v2(p_card_id, p_expected_review_count, p_rating)` (full JSON row),
`clear_account_drawings_v2(p_expected_owner)` and
`save_document_position_v2(p_document_id, p_generation, p_virtual_index)`.
The required expected owner binds standalone creation and whole-account clear to
the initiating account. The other operations bind an existing owned row/document.
Errors: PDD01 missing/deleted, PDD02 generation mismatch, PDC01 revision/review
conflict, PDC02 changed idempotency input, PDQ01 quota, 42501 authorization.
Serialization/deadlock errors remain transient; callers retain the frozen write.

Local evidence: 17 PGlite assertions/subtests, 8 PostgreSQL separate-connection
race scenarios, full branch suite 340 passing, TypeScript clean, lint zero errors
and 28 existing warnings. The fixture models reviewed table shapes and default
service grants; this is not proof of an unseen hosted schema. Reconcile live
orphans, nullable historical references and any additional tables before rollout.
