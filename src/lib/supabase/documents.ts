import { sb, userId, markDocumentRegistered, forgetDocumentRegistration } from './dbShared';
import { deleteLocalDocument } from '@/lib/documentLocalData';
import { enqueueDocumentDeletion, enqueueDocumentRegistration } from '@/lib/persistence/documentQueue';

// ── Documents ────────────────────────────────────────────────────────────────

// Persist metadata by stable document ID, never by a potentially duplicated filename.
export async function upsertDocument(doc: { id: string; name: string; type: string; pageCount?: number }): Promise<string> {
  return enqueueDocumentRegistration(doc.id, async () => {
    const uid = await userId(); if (!uid) throw new Error('Sign in to open a document');

    const canonicalId = doc.id;

    const { error } = await sb().from('documents').upsert({
      id: canonicalId, user_id: uid, name: doc.name, type: doc.type,
      page_count: doc.pageCount ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) throw new Error(`Could not register document: ${error.message}`);
    else {
      console.log('[DB] upsertDocument OK — canonicalId:', canonicalId, 'localId:', doc.id, 'name:', doc.name);
      markDocumentRegistered(uid, canonicalId);
    }
    return canonicalId;
  }).catch((error: unknown) => {
    // Preserve the metadata API's best-effort contract; failed registration
    // must leave the deletion barrier in place.
    console.error('[DB] upsertDocument error:', error);
    return doc.id;
  });
}

export async function fetchDocuments(): Promise<Array<{ id: string; name: string; type: string }>> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('documents').select('id, name, type').eq('user_id', uid);
  return data ?? [];
}

export async function deleteDocument(docId: string) {
  return enqueueDocumentDeletion(docId, async () => {
    const { error } = await sb().from('documents').delete().eq('id', docId);
    if (error) throw error;
    forgetDocumentRegistration(docId);
  });
}

export async function deleteAllVoiceNotesForDocument(docId: string): Promise<void> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to delete a document');
  const { data, error: readError } = await sb().from('voice_notes').select('id').match({ user_id: uid, document_id: docId });
  if (readError) throw readError;
  if (data?.length) {
    const exts = ['webm', 'ogg', 'mp4'];
    const paths = data.flatMap((r) => exts.map((e) => `${uid}/${docId}/${r.id}.${e}`));
    const { error: storageError } = await sb().storage.from('voice-notes').remove(paths);
    if (storageError) throw storageError;
    const { error } = await sb().from('voice_notes').delete().match({ user_id: uid, document_id: docId });
    if (error) throw error;
  }
}

export async function deleteAllDataForDocument(docId: string): Promise<void> {
  return enqueueDocumentDeletion(docId, async () => {
    const uid = await userId(); if (!uid) throw new Error('Sign in to delete a document');
    await deleteAllVoiceNotesForDocument(docId);
    const results = await Promise.all([
      sb().from('drawings').delete().match({ user_id: uid, document_id: docId }),
      sb().from('text_notes').delete().match({ user_id: uid, document_id: docId }),
      sb().from('bookmarks').delete().match({ user_id: uid, document_id: docId }),
      sb().from('key_terms').delete().match({ user_id: uid, document_id: docId }),
      sb().from('blank_pages').delete().match({ user_id: uid, document_id: docId }),
      sb().from('page_image_annotations').delete().match({ user_id: uid, document_id: docId }),
      // flashcards uses doc_id (not document_id)
      sb().from('flashcards').delete().match({ user_id: uid, doc_id: docId }),
      // session_state: one row per user keyed on user_id; delete only if it points to this doc
      sb().from('session_state').delete().match({ user_id: uid, doc_id: docId }),
    ]);
    for (const result of results) if (result.error) throw result.error;
    const { error } = await sb().from('documents').delete().match({ id: docId, user_id: uid });
    if (error) throw error;
    // Remove from in-process cache so a re-add starts fresh
    forgetDocumentRegistration(docId);
  });
}

// ── Library ───────────────────────────────────────────────────────────────────

export interface LibraryDocument {
  id: string;
  name: string;
  type: string;
  pageCount: number | null;
  updatedAt: string;
  createdAt: string;
  voiceNoteCount: number;
  drawingCount: number;
  textNoteCount: number;
}

export async function fetchLibraryDocuments(): Promise<LibraryDocument[]> {
  const uid = await userId(); if (!uid) return [];
  const { data: docs } = await sb()
    .from('documents')
    .select('id, name, type, page_count, created_at, updated_at')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false });
  if (!docs?.length) return [];

  const ids = docs.map((d) => d.id);
  const [vnRes, drRes, tnRes] = await Promise.all([
    sb().from('voice_notes').select('document_id').eq('user_id', uid).in('document_id', ids),
    sb().from('drawings').select('document_id').eq('user_id', uid).in('document_id', ids),
    sb().from('text_notes').select('document_id').eq('user_id', uid).in('document_id', ids),
  ]);

  const countMap = (rows: Array<{ document_id: string }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.document_id, (m.get(r.document_id) ?? 0) + 1);
    return m;
  };
  const vnMap = countMap(vnRes.data);
  const drMap = countMap(drRes.data);
  const tnMap = countMap(tnRes.data);

  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    pageCount: d.page_count ?? null,
    updatedAt: d.updated_at,
    createdAt: d.created_at,
    voiceNoteCount: vnMap.get(d.id) ?? 0,
    drawingCount: drMap.get(d.id) ?? 0,
    textNoteCount: tnMap.get(d.id) ?? 0,
  }));
}

export async function deleteLibraryDocument(docId: string): Promise<void> {
  await deleteAllDataForDocument(docId);
  await deleteLocalDocument(docId);
}

