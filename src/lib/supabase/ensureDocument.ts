import type { createClient } from './client';

/** Establish the parent row before saving annotations, without replacing metadata. */
export async function ensureDocument(client: ReturnType<typeof createClient>, userId: string, documentId: string) {
  const { error } = await client.from('documents').upsert({
    id: documentId, user_id: userId, name: documentId, type: 'pdf',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Could not register document: ${error.message}`);
}
