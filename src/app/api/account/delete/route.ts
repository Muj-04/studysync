import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const STORAGE_PAGE_SIZE = 100;

type StorageEntry = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type StorageClient = SupabaseClient['storage'];

async function listFiles(
  storage: StorageClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage
      .from(bucket)
      .list(prefix, { limit: STORAGE_PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`storage list failed for ${bucket}`);

    const entries = (data ?? []) as StorageEntry[];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id || entry.metadata) files.push(path);
      else files.push(...await listFiles(storage, bucket, path));
    }
    if (entries.length < STORAGE_PAGE_SIZE) break;
    offset += STORAGE_PAGE_SIZE;
  }

  return files;
}

async function removeFiles(
  storage: StorageClient,
  bucket: string,
  paths: Iterable<string>,
): Promise<void> {
  const unique = [...new Set(paths)];
  for (let index = 0; index < unique.length; index += 100) {
    const { error } = await storage.from(bucket).remove(unique.slice(index, index + 100));
    if (error) throw new Error(`storage removal failed for ${bucket}`);
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'account deletion unavailable' }, { status: 503 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const [roomsResult, roomNotesResult, subscriptionResult] = await Promise.all([
      admin.from('study_rooms').select('id').eq('host_user_id', user.id),
      admin.from('room_voice_notes').select('id, room_id').eq('user_id', user.id),
      admin.from('subscriptions')
        .select('stripe_subscription_id, status')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    if (roomsResult.error || roomNotesResult.error || subscriptionResult.error) {
      throw new Error('account storage inventory failed');
    }

    const stripeSubscriptionId = subscriptionResult.data?.stripe_subscription_id as string | null | undefined;
    const subscriptionStatus = String(subscriptionResult.data?.status ?? '');
    if (stripeSubscriptionId && !['canceled', 'incomplete_expired'].includes(subscriptionStatus)) {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) throw new Error('subscription cancellation unavailable');
      const stripe = new Stripe(stripeKey, { apiVersion: '2026-05-27.dahlia' });
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch (error) {
        if ((error as { code?: string }).code !== 'resource_missing') {
          throw new Error('subscription cancellation failed');
        }
      }
    }

    const hostedRoomIds = (roomsResult.data ?? []).map((room) => String(room.id));
    const [avatarFiles, pdfFiles, personalVoiceFiles, ...hostedRoomVoiceFiles] = await Promise.all([
      listFiles(admin.storage, 'avatars', user.id),
      listFiles(admin.storage, 'pdfs', user.id),
      listFiles(admin.storage, 'voice-notes', user.id),
      ...hostedRoomIds.map((roomId) => listFiles(admin.storage, 'voice-notes', `rooms/${roomId}`)),
    ]);

    const authoredRoomVoiceFiles = (roomNotesResult.data ?? []).flatMap((note) =>
      ['webm', 'ogg', 'mp4'].map((ext) => `rooms/${note.room_id}/${note.id}.${ext}`),
    );

    await removeFiles(admin.storage, 'avatars', avatarFiles);
    await removeFiles(admin.storage, 'pdfs', pdfFiles);
    await removeFiles(admin.storage, 'voice-notes', [
      ...personalVoiceFiles,
      ...hostedRoomVoiceFiles.flat(),
      ...authoredRoomVoiceFiles,
    ]);

    const { error: deleteError } = await admin.rpc('delete_user_account', {
      p_user_id: user.id,
    });
    if (deleteError) throw new Error('account database deletion failed');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Account deletion] failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'account deletion failed' }, { status: 500 });
  }
}
