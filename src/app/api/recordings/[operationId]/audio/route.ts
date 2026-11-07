import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await context.params;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(operationId)) return new Response(null, { status: 404, headers });
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return new Response(null, { status: 401, headers });
    // User-JWT RPC rechecks current document/room authorization and publication.
    const { data: path, error } = await client.rpc('recording_playback_path', { p_id: operationId });
    if (error || typeof path !== 'string' || !path) return new Response(null, { status: 404, headers });
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return new Response(null, { status: 503, headers });
    const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: signingError } = await service.storage.from('voice-notes').createSignedUrl(path, 60);
    if (signingError || !data?.signedUrl) return new Response(null, { status: 503, headers });
    return new Response(null, { status: 307, headers: { ...headers, Location: data.signedUrl } });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
