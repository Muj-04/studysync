import type { SupabaseClient } from '@supabase/supabase-js';

export async function reserveAiRequest(admin: SupabaseClient, userId: string, month: string, limit: number): Promise<string | null> {
  const { data, error } = await admin.rpc('reserve_ai_request', {
    p_user_id: userId, p_month: month, p_limit: Number.isFinite(limit) ? limit : null,
  });
  if (error) throw new Error(`Could not reserve AI quota: ${error.message}`);
  return data as string | null;
}

export async function refundAiRequest(admin: SupabaseClient, reservation: string) {
  const { error } = await admin.rpc('refund_ai_request', { p_reservation: reservation });
  if (error) console.error('Could not refund failed AI request', error.message);
}
