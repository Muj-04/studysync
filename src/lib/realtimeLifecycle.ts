import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

const pending = new WeakMap<SupabaseClient, Map<string, Promise<unknown>>>();

/** Supabase caches channels by topic until asynchronous removal finishes. */
export function releaseRealtimeChannel(client: SupabaseClient, channel: RealtimeChannel) {
  let topics = pending.get(client);
  if (!topics) { topics = new Map(); pending.set(client, topics); }
  const previous = topics.get(channel.topic) ?? Promise.resolve();
  const removal = previous.catch(() => {}).then(() => client.removeChannel(channel));
  topics.set(channel.topic, removal);
  const clear = () => { if (topics.get(channel.topic) === removal) topics.delete(channel.topic); };
  void removal.then(clear, clear);
  return removal;
}

export async function waitForChannelRelease(client: SupabaseClient, name: string) {
  for (;;) {
    const removal = pending.get(client)?.get(`realtime:${name}`);
    if (!removal) return;
    await removal;
  }
}
