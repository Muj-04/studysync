// Scheduled every minute by pg_cron (migration 20261120200000_schedule_recording_worker).
// Runs one bounded pass of the #41 recording recovery worker with the
// service-role key that Supabase injects into Edge Functions. Each call must present
// the database-generated invocation token, which is checked server-side.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runRecordingRecoveryWorker } from './worker.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!url || !key) return new Response('Worker not configured', { status: 500 });
  const passDeadline = AbortSignal.timeout(50_000);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, {
        ...init,
        signal: AbortSignal.any([passDeadline, AbortSignal.timeout(10_000), ...(init.signal ? [init.signal] : [])]),
      }),
    },
  });
  const token = req.headers.get('x-worker-token') ?? '';
  const check = await client.rpc('recording_worker_token_ok', { p_token: token });
  if (check.error || check.data !== true) return new Response('Forbidden', { status: 403 });
  try {
    const result = await runRecordingRecoveryWorker(client, { limit: 20, timeBudgetMs: 45_000 });
    return Response.json(result);
  } catch {
    // Unfinished leases are reclaimed after expiry; never echo provider details.
    return Response.json({ error: 'Worker pass failed; unfinished leases remain recoverable.' }, { status: 500 });
  }
});
