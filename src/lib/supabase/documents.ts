import { preserveDocumentBeforeRemoval } from '@/lib/documentRecovery';
import { registerDocument, assertDocumentOwner } from './documentProtocol';
import { sb, userId, markDocumentRegistered, forgetDocumentRegistration } from './dbShared';
import { deleteLocalDocument } from '@/lib/documentLocalData';
import { enqueueDocumentDeletion, enqueueDocumentRegistration } from '@/lib/persistence/documentQueue';
import { deleteRecording, pendingRecordingIds } from './recordingRecovery';

// ── Documents ────────────────────────────────────────────────────────────────

// Persist metadata by stable document ID, never by a potentially duplicated filename.
export async function upsertDocument(doc: { id: string; name: string; type: string; pageCount?: number }): Promise<string> {
  const owner = userId();
  return enqueueDocumentRegistration(doc.id, async () => {
    const uid = await owner; if (!uid) throw new Error('Sign in to open a document');
    await registerDocument(uid, doc);
    markDocumentRegistered(uid, doc.id);
    return doc.id;
  });
}

export async function fetchDocuments(): Promise<Array<{ id: string; name: string; type: string }>> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('documents').select('id, name, type').eq('user_id', uid);
  return data ?? [];
}

export async function deleteDocument(docId: string) {
  const owner = userId();
  return enqueueDocumentDeletion(docId, async () => {
    const uid = await owner; if (!uid) throw new Error('Sign in to delete a document');
    await assertDocumentOwner(uid);
    const { error } = await sb().from('documents').delete().match({ id: docId, user_id: uid });
    if (error) throw error;
    forgetDocumentRegistration(docId);
  });
}

export async function deleteAllVoiceNotesForDocument(docId: string, expectedOwner?: string): Promise<void> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to delete a document');
  if (expectedOwner && uid !== expectedOwner) throw new Error('The account changed before recording synchronization finished.');
  const { data, count, error: readError } = await sb().from('voice_notes').select('id', { count: 'exact' }).match({ user_id: uid, document_id: docId });
  if (readError) throw readError;
  if (count == null || count !== data?.length) throw new Error('The recording list is incomplete. No recordings were deleted; please try again.');
  const ids = new Set([...(data ?? []).map(row => row.id as string), ...pendingRecordingIds(uid, 'document', docId)]);
  for (const id of ids) {
    await deleteRecording('document', docId, id, uid);
  }
}

export async function deleteAllDataForDocument(docId: string): Promise<void> {
  const requestedOwner = userId();
  return enqueueDocumentDeletion(docId, async () => {
    const uid = await requestedOwner; if (!uid) throw new Error('Sign in to delete a document');
    await assertDocumentOwner(uid);
    // Retain legacy audio cleanup until the recording operation migration is
    // activated. With that protocol this durably requests cleanup; its triggers
    // also cover recordings racing this final parent transaction.
    await deleteAllVoiceNotesForDocument(docId, uid);
    await assertDocumentOwner(uid);
    const { error } = await sb().from('documents').delete().match({ id: docId, user_id: uid });
    if (error) throw error;
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
  const owner = await userId();
  if (!owner) throw new Error('Sign in to delete this document');
  preserveDocumentBeforeRemoval(owner, docId, 'Recovered document');
  await deleteAllDataForDocument(docId);
  if (await userId() !== owner) throw new Error('Account changed before local cleanup');
  await deleteLocalDocument(docId, true);
}

