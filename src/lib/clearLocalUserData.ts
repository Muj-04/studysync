import { clearPendingReopenFile } from './pendingReopenFile';

/**
 * Wipe every per-user key from localStorage + IndexedDB at sign-out so
 * the next user on the same device doesn't inherit the prior account's
 * voice notes, drawings, bookmarks, document map, theme, or pending
 * file uploads.
 *
 * Strategy: iterate keys and remove anything matching one of:
 *   - the `studysync_` prefix (covers the 20+ entries in `KEYS` plus
 *     `studysync_pending_ref`, `studysync_session_id`,
 *     `studysync_language`, `studysync_onboarding_v1`)
 *   - the explicit non-prefix legacy list below
 *
 * We do NOT call `localStorage.clear()` — third-party scripts (analytics,
 * embeds) may leave keys we don't own and shouldn't touch.
 *
 * Also clears the `studysync_tmp` IndexedDB used by
 * pendingReopenFile.ts, which stores the actual File blob a user
 * uploaded but hadn't yet saved.
 */

// Keys that escaped the `studysync_` naming convention but are still
// per-user state.
const NON_PREFIX_KEYS = [
  'theme',                    // legacy theme cache (read by layout.tsx pre-hydration)
  'activeRoom',               // currently-joined study room context
  'community_saved_posts',    // user's saved community posts
  'help_getting_started_v1',  // dismissed-help flag
];

export async function clearLocalUserData(): Promise<void> {
  // localStorage — collect first, then remove (mutating during iteration is
  // a footgun on the Storage API).
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Referral retries contain only a code and outcome, scoped by account.
      // Keep failed intent across logout; replay checks the current identity.
      if (key.startsWith('studysync_referral_recovery_')) continue;
      if (key.startsWith('studysync_') || NON_PREFIX_KEYS.includes(key)) {
        // Owner-scoped pending metadata must survive sign-out so a completed
        // upload or cleanup is not abandoned. No audio, tokens or signed playback
        // URLs are stored here; replay verifies the owner before every phase.
        if (key.startsWith('studysync_recording_recovery_')) continue;
        if (['studysync_document_outbox_', 'studysync_document_recovery_', 'studysync_document_generation_'].some(prefix => key.startsWith(prefix))) continue;
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage unavailable (private mode etc.) — best-effort only
  }

  // IndexedDB pending-file blob
  try {
    await clearPendingReopenFile();
  } catch {
    // IndexedDB unavailable — best-effort only
  }
}
