import type { SupabaseClient } from '@supabase/supabase-js';

export async function reserveAiRequest(admin: SupabaseClient, userId: string, month: string, limit: number): Promise<string | null> {
  const { data, error } = await admin.rpc('reserve_ai_request_v2', {
    p_user_id: userId, p_month: month, p_limit: Number.isFinite(limit) ? limit : null,
  });
  if (error) throw new Error(`Could not reserve AI quota: ${error.message}`);
  return data as string | null;
}

// These operations are idempotent, so retry even if a response was lost after commit.
async function settleRequest(admin: SupabaseClient, reservation: string, operation: 'refund_ai_request' | 'complete_ai_request') {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error } = await admin.rpc(operation, { p_reservation: reservation });
      if (error) throw new Error(`${operation} failed: ${error.message}`);
      if (operation === 'complete_ai_request' && data !== true) throw new Error('AI quota reservation expired');
      return;
    } catch (error) { failure = error; }
  }
  throw failure;
}

export function refundAiRequest(admin: SupabaseClient, reservation: string) {
  return settleRequest(admin, reservation, 'refund_ai_request');
}

export function completeAiRequest(admin: SupabaseClient, reservation: string) {
  return settleRequest(admin, reservation, 'complete_ai_request');
}
