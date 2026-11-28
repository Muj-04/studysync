import type { SupabaseClient } from '@supabase/supabase-js';

export interface AiReservation {
  /** Reservation id, or null when a limit was reached. */
  reservation: string | null;
  /** Which limit refused the request. */
  limit: 'daily' | 'monthly' | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
}

/** Atomically reserves one AI request against the plan's daily and monthly limits (database-enforced). */
export async function reserveAiRequest(admin: SupabaseClient, userId: string, month: string): Promise<AiReservation> {
  const { data, error } = await admin.rpc('reserve_ai_request_v3', { p_user_id: userId, p_month: month });
  if (error) throw new Error(`Could not reserve AI quota: ${error.message}`);
  const reply = (data ?? {}) as { reservation?: string | null; limit?: 'daily' | 'monthly' | null; daily_limit?: number | null; monthly_limit?: number | null };
  return {
    reservation: reply.reservation ?? null,
    limit: reply.limit ?? null,
    dailyLimit: reply.daily_limit ?? null,
    monthlyLimit: reply.monthly_limit ?? null,
  };
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
