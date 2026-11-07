import type { SupabaseClient } from '@supabase/supabase-js';

type Job = { id: string; state: 'awaiting_upload' | 'deleting'; object_path: string; lease_token: string };
/** One explicit bounded pass. The caller supplies a server-only service-role client. */
export async function runRecordingRecoveryWorker(client: SupabaseClient, options: {
  limit?: number; timeBudgetMs?: number; now?: () => number;
} = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 20));
  const now = options.now ?? Date.now;
  const deadline = now() + Math.max(1, Math.min(options.timeBudgetMs ?? 60_000, 60_000));
  let attempted = 0, completed = 0, deferred = 0;
  while (attempted < limit && now() < deadline) {
    const claim = await client.rpc('claim_recording_operations', { p_limit: 1 });
    if (claim.error) throw new Error('Recording work could not be claimed.');
    const job = (claim.data as Job[] | null)?.[0];
    if (!job) break;
    attempted++;
    try {
      const args = { p_id: job.id, p_lease: job.lease_token };
      if (job.state === 'awaiting_upload') {
        const result = await client.rpc('publish_claimed_recording', args);
        if (result.error) throw new Error(result.error.message);
        completed++;
      } else if (job.state === 'deleting') {
        const prepared = await client.rpc('prepare_recording_cleanup', args);
        if (prepared.error || typeof prepared.data !== 'string' || prepared.data !== job.object_path) {
          throw new Error(prepared.error?.message ?? 'Recording cleanup path was not authorized.');
        }
        const removed = await client.storage.from('voice-notes').remove([prepared.data]);
        if (removed.error) throw new Error(removed.error.message);
        const finished = await client.rpc('complete_recording_cleanup', args);
        if (finished.error) throw new Error(finished.error.message);
        completed++;
      } else throw new Error('Unsupported recording operation.');
    } catch {
      deferred++;
      // Do not persist arbitrary provider messages/URLs/tokens in the journal.
      // If release also fails, lease expiry makes this item reclaimable.
      await Promise.resolve(client.rpc('release_recording_lease', {
        p_id: job.id, p_lease: job.lease_token, p_error: 'Worker attempt failed; retry after lease/backoff.',
      })).catch(() => undefined);
    }
  }
  return { attempted, completed, deferred };
}
