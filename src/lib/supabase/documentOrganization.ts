import { sb, userId } from './dbShared';

// ── Document Tags ─────────────────────────────────────────────────────────────

export async function getDocumentTags(docId: string): Promise<string[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('document_tags').select('tag').eq('user_id', uid).eq('document_id', docId);
  return (data ?? []).map((r) => r.tag);
}

export async function getAllUserTags(): Promise<string[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('document_tags').select('tag').eq('user_id', uid);
  return [...new Set((data ?? []).map((r) => r.tag as string))].sort();
}

export async function addDocumentTag(docId: string, tag: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('document_tags').upsert(
    { user_id: uid, document_id: docId, tag },
    { onConflict: 'user_id,document_id,tag', ignoreDuplicates: true },
  );
}

export async function removeDocumentTag(docId: string, tag: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('document_tags').delete().eq('user_id', uid).eq('document_id', docId).eq('tag', tag);
}

export async function getDocumentTagsMap(docIds: string[]): Promise<Record<string, string[]>> {
  const uid = await userId(); if (!uid || !docIds.length) return {};
  const { data } = await sb().from('document_tags').select('document_id, tag')
    .eq('user_id', uid).in('document_id', docIds);
  const map: Record<string, string[]> = {};
  for (const r of (data ?? [])) {
    (map[r.document_id] ??= []).push(r.tag as string);
  }
  return map;
}

// ── Document Favorites ────────────────────────────────────────────────────────

export async function getFavoriteDocIds(): Promise<Set<string>> {
  const uid = await userId(); if (!uid) return new Set();
  const { data } = await sb().from('document_favorites').select('document_id').eq('user_id', uid);
  return new Set((data ?? []).map((r) => r.document_id as string));
}

export async function toggleFavorite(docId: string): Promise<boolean> {
  const uid = await userId(); if (!uid) return false;
  const { data: existing } = await sb().from('document_favorites')
    .select('document_id').eq('user_id', uid).eq('document_id', docId).maybeSingle();
  if (existing) {
    await sb().from('document_favorites').delete().eq('user_id', uid).eq('document_id', docId);
    return false;
  }
  await sb().from('document_favorites').insert({ user_id: uid, document_id: docId });
  return true;
}

