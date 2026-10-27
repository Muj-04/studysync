import { sb, userId } from './dbShared';

// ── Global Search ─────────────────────────────────────────────────────────────

export interface GlobalSearchResult {
  type: 'document' | 'text_note' | 'voice_note' | 'bookmark';
  docId: string;
  docName: string;
  pageNum?: number;
  content: string;
}

export async function globalSearch(query: string): Promise<GlobalSearchResult[]> {
  const uid = await userId(); if (!uid || !query.trim()) return [];
  const q = query.trim();

  const [docsRes, notesRes, vnRes, bmRes] = await Promise.all([
    sb().from('documents').select('id, name').eq('user_id', uid).ilike('name', `%${q}%`).limit(5),
    sb().from('text_notes').select('document_id, page_key, content').eq('user_id', uid).ilike('content', `%${q}%`).limit(10),
    sb().from('voice_notes').select('document_id, page_number, title').eq('user_id', uid).ilike('title', `%${q}%`).limit(5),
    sb().from('bookmarks').select('document_id, virtual_index, label').eq('user_id', uid).ilike('label', `%${q}%`).limit(5),
  ]);

  // Build doc name map from documents result + a lookup for other tables
  const docMap: Record<string, string> = {};
  for (const d of docsRes.data ?? []) docMap[d.id] = d.name;

  // For notes/vn/bookmarks we may need doc names not in docsRes — fetch them
  const missingIds = new Set<string>();
  for (const r of [...(notesRes.data ?? []), ...(vnRes.data ?? []), ...(bmRes.data ?? [])]) {
    const did = r.document_id;
    if (did && !docMap[did]) missingIds.add(did);
  }
  if (missingIds.size > 0) {
    const { data: extraDocs } = await sb().from('documents').select('id, name').in('id', [...missingIds]);
    for (const d of extraDocs ?? []) docMap[d.id] = d.name;
  }

  const results: GlobalSearchResult[] = [];

  for (const d of docsRes.data ?? []) {
    results.push({ type: 'document', docId: d.id, docName: d.name, content: d.name });
  }
  for (const n of notesRes.data ?? []) {
    const pageNum = parseInt(n.page_key ?? '1', 10) || 1;
    results.push({ type: 'text_note', docId: n.document_id, docName: docMap[n.document_id] ?? '', pageNum, content: n.content });
  }
  for (const v of vnRes.data ?? []) {
    const pageNum = parseInt(String(v.page_number ?? 1), 10) || 1;
    results.push({ type: 'voice_note', docId: v.document_id, docName: docMap[v.document_id] ?? '', pageNum, content: v.title ?? 'Voice note' });
  }
  for (const b of bmRes.data ?? []) {
    results.push({ type: 'bookmark', docId: b.document_id, docName: docMap[b.document_id] ?? '', pageNum: b.virtual_index ?? undefined, content: b.label ?? 'Bookmark' });
  }

  return results;
}
