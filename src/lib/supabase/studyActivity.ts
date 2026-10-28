import { requireDocumentGeneration, assertDocumentOwner } from './documentProtocol';
import { enqueueDocumentWrite } from '@/lib/persistence/documentQueue';
import { createSerialQueue } from '@/lib/persistence/serialQueue';
import { sb, userId } from './dbShared';

// ── Session State ─────────────────────────────────────────────────────────────

const enqueueSessionWrite = createSerialQueue();
let latestSessionRequest = 0;

async function saveSessionStateNow(uid: string, docId: string, virtualIndex: number) {
  const document_generation = await requireDocumentGeneration(uid, docId);
  await assertDocumentOwner(uid);
  const { error } = await sb().from('session_state').upsert({
    user_id: uid, doc_id: docId, document_generation, virtual_index: virtualIndex,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function fetchSessionState(): Promise<{ docId: string; virtualIndex: number } | null> {
  const uid = await userId(); if (!uid) return null;
  const { data } = await sb().from('session_state').select('doc_id, virtual_index').eq('user_id', uid).single();
  if (!data?.doc_id) return null;
  return { docId: data.doc_id, virtualIndex: data.virtual_index ?? 0 };
}

// ── Dashboard aggregates ──────────────────────────────────────────────────────

export async function fetchDashboardData() {
  const uid = await userId();
  if (!uid) return null;

  const [docsRes, voiceRes, textRes, bookmarksRes] = await Promise.all([
    sb().from('documents').select('id, name').eq('user_id', uid),
    sb().from('voice_notes').select('id, document_id').eq('user_id', uid),
    sb().from('text_notes').select('id, document_id').eq('user_id', uid),
    sb().from('bookmarks').select('id, document_id, virtual_index, label').eq('user_id', uid),
  ]);

  const docs = docsRes.data ?? [];
  const voiceNotes = voiceRes.data ?? [];
  const textNotes = textRes.data ?? [];
  const bookmarks = bookmarksRes.data ?? [];

  const docIdToName: Record<string, string> = {};
  docs.forEach((d) => { docIdToName[d.id] = d.name; });

  const voiceCountByDoc: Record<string, number> = {};
  voiceNotes.forEach((n) => { voiceCountByDoc[n.document_id] = (voiceCountByDoc[n.document_id] ?? 0) + 1; });

  const textCountByDoc: Record<string, number> = {};
  textNotes.forEach((n) => { textCountByDoc[n.document_id] = (textCountByDoc[n.document_id] ?? 0) + 1; });

  const bookmarkCountByDoc: Record<string, number> = {};
  bookmarks.forEach((b) => { bookmarkCountByDoc[b.document_id] = (bookmarkCountByDoc[b.document_id] ?? 0) + 1; });

  return {
    docs: docs.map((d) => ({
      id: d.id, name: d.name,
      voiceNoteCount: voiceCountByDoc[d.id] ?? 0,
      textNoteCount: textCountByDoc[d.id] ?? 0,
      bookmarkCount: bookmarkCountByDoc[d.id] ?? 0,
    })),
    totalVoiceNotes: voiceNotes.length,
    totalTextNotes: textNotes.length,
    totalBookmarks: bookmarks.length,
    recentBookmarks: bookmarks.slice(0, 6).map((b) => ({
      id: b.id, documentId: b.document_id, virtualIndex: b.virtual_index,
      label: b.label, docName: docIdToName[b.document_id] ?? 'Unknown',
    })),
  };
}

// ── Study Sessions ────────────────────────────────────────────────────────────

export async function startStudySession(docId: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const document_generation = await requireDocumentGeneration(uid, docId);
  await assertDocumentOwner(uid);
  const { data, error } = await sb().from('study_sessions')
    .insert({ user_id: uid, document_id: docId, document_generation })
    .select('id').single();
  if (error) { console.error('[DB] startStudySession error:', error.message); return null; }
  return data.id;
}

export async function endStudySession(sessionId: string): Promise<void> {
  const endedAt = new Date().toISOString();
  const { data: session } = await sb().from('study_sessions')
    .select('started_at').eq('id', sessionId).maybeSingle();
  if (!session) return;
  const durationSeconds = Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000);
  if (durationSeconds < 10) {
    await sb().from('study_sessions').delete().eq('id', sessionId);
    return;
  }
  await sb().from('study_sessions').update({ ended_at: endedAt, duration_seconds: durationSeconds }).eq('id', sessionId);
}

export async function getStudyStreak(): Promise<number> {
  const uid = await userId(); if (!uid) return 0;
  const { data, error } = await sb().rpc('get_study_streak', { p_user_id: uid });
  if (error) { console.error('[DB] getStudyStreak error:', error.message); return 0; }
  return (data as number) ?? 0;
}

export async function getStudyTimeMap(docIds: string[]): Promise<Record<string, number>> {
  const uid = await userId(); if (!uid || !docIds.length) return {};
  const { data, error } = await sb().rpc('get_study_time_map', { p_user_id: uid, p_doc_ids: docIds });
  if (error) { console.error('[DB] getStudyTimeMap error:', error.message); return {}; }
  const map: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ document_id: string; total_seconds: number }>) {
    map[r.document_id] = r.total_seconds;
  }
  return map;
}

export async function getTodayStudySeconds(): Promise<number> {
  const uid = await userId(); if (!uid) return 0;
  const { data } = await sb().rpc('get_today_study_seconds', { p_user_id: uid });
  return (data as number) ?? 0;
}


/** Share the document lifetime with collection writes and deletion. */
export function saveSessionState(docId: string, virtualIndex: number): Promise<void> {
  const request = ++latestSessionRequest;
  // Capture identity before waiting for document writes. Settle auth failures
  // immediately so even a rejected document enqueue leaves no orphan rejection.
  const requestedOwner = userId().then(
    uid => ({ uid, error: undefined }),
    (error: unknown) => ({ uid: null, error }),
  );
  return enqueueDocumentWrite(docId, async () => {
    const owner = await requestedOwner;
    if (owner.error) throw owner.error;
    const uid = owner.uid;
    if (!uid || request !== latestSessionRequest) return;
    // Session state is one row per account, so writes for different documents
    // must also serialize. Skip stale requests delayed by either queue.
    return enqueueSessionWrite(uid, async () => {
      const currentUid = await userId();
      if (currentUid !== uid || request !== latestSessionRequest) return;
      await saveSessionStateNow(uid, docId, virtualIndex);
    });
  });
}
