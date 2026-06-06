import { createClient } from './client';
import type { VoiceNote, TextNote, Bookmark, KeyTerm, BlankPage } from '@/types';

// ── helpers ─────────────────────────────────────────────────────────────────

function sb() { return createClient(); }

async function userId(): Promise<string | null> {
  const { data: { user } } = await sb().auth.getUser();
  return user?.id ?? null;
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function upsertDocument(doc: { id: string; name: string; type: string; pageCount?: number }) {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb().from('documents').upsert({
    id: doc.id, user_id: uid, name: doc.name, type: doc.type,
    page_count: doc.pageCount ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) console.error('[DB] upsertDocument error:', error.message, 'docId:', doc.id);
  else console.log('[DB] upsertDocument OK — docId:', doc.id, 'name:', doc.name);
}

export async function fetchDocuments(): Promise<Array<{ id: string; name: string; type: string }>> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('documents').select('id, name, type').eq('user_id', uid);
  return data ?? [];
}

export async function deleteDocument(docId: string) {
  await sb().from('documents').delete().eq('id', docId);
}

// ── Voice Notes ──────────────────────────────────────────────────────────────

export async function saveVoiceNote(note: VoiceNote) {
  const uid = await userId(); if (!uid) return null;

  let audioUrl: string | null = null;

  if (note.audioBlob) {
    const ext = note.audioBlob.type.includes('ogg') ? 'ogg' : note.audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const path = `${uid}/${note.documentId}/${note.id}.${ext}`;
    const { error } = await sb().storage.from('voice-notes').upload(path, note.audioBlob, { upsert: true });
    if (!error) {
      const { data: urlData } = sb().storage.from('voice-notes').getPublicUrl(path);
      audioUrl = urlData?.publicUrl ?? null;
      if (!audioUrl) {
        const { data: signed } = await sb().storage.from('voice-notes').createSignedUrl(path, 60 * 60 * 24 * 365);
        audioUrl = signed?.signedUrl ?? null;
      }
    }
  }

  const { error } = await sb().from('voice_notes').upsert({
    id: note.id,
    user_id: uid,
    document_id: note.documentId,
    page_number: String(note.pageNumber),
    duration: note.duration,
    title: note.title ?? null,
    audio_url: audioUrl,
    timestamp: note.timestamp instanceof Date ? note.timestamp.toISOString() : note.timestamp,
  }, { onConflict: 'id' });

  return error ? null : audioUrl;
}

export async function fetchVoiceNotes(docId?: string): Promise<Array<{
  id: string; documentId: string; pageNumber: string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
}>> {
  const uid = await userId(); if (!uid) return [];
  let q = sb().from('voice_notes').select('*').eq('user_id', uid);
  if (docId) q = q.eq('document_id', docId);
  const { data } = await q.order('timestamp', { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, pageNumber: r.page_number,
    duration: r.duration, title: r.title, audioUrl: r.audio_url, timestamp: r.timestamp,
  }));
}

export async function updateVoiceNoteTitle(noteId: string, title: string | undefined) {
  const uid = await userId(); if (!uid) return;
  await sb().from('voice_notes').update({ title: title ?? null }).eq('id', noteId).eq('user_id', uid);
}

export async function deleteVoiceNote(noteId: string, docId: string) {
  const uid = await userId(); if (!uid) return;
  const ext = ['webm', 'ogg', 'mp4'];
  for (const e of ext) {
    await sb().storage.from('voice-notes').remove([`${uid}/${docId}/${noteId}.${e}`]);
  }
  await sb().from('voice_notes').delete().eq('id', noteId);
}

// ── Text Notes ───────────────────────────────────────────────────────────────

export async function saveTextNotes(docId: string, pageKey: string, notes: TextNote[]) {
  const uid = await userId(); if (!uid) return;
  await sb().from('text_notes').delete().match({ user_id: uid, document_id: docId, page_key: pageKey });
  if (notes.length === 0) return;
  await sb().from('text_notes').insert(notes.map((n) => ({
    id: n.id, user_id: uid, document_id: docId, page_key: pageKey,
    x: n.x, y: n.y, width: n.width, height: n.height,
    content: n.content, font_size: n.fontSize, color: n.color,
  })));
}

export async function fetchTextNotes(docId: string): Promise<Record<string, TextNote[]>> {
  const uid = await userId();
  console.log('[DB] fetchTextNotes uid:', uid, 'docId:', docId);
  if (!uid) return {};
  const { data, error } = await sb().from('text_notes').select('*').match({ user_id: uid, document_id: docId });
  console.log('[DB] fetchTextNotes rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  const map: Record<string, TextNote[]> = {};
  for (const r of data ?? []) {
    const note: TextNote = { id: r.id, x: r.x, y: r.y, width: r.width, height: r.height, content: r.content, fontSize: r.font_size, color: r.color };
    (map[r.page_key] ??= []).push(note);
  }
  return map;
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function saveBookmarks(docId: string, bookmarks: Bookmark[]) {
  const uid = await userId(); if (!uid) return;
  await sb().from('bookmarks').delete().match({ user_id: uid, document_id: docId });
  if (bookmarks.length === 0) return;
  await sb().from('bookmarks').insert(bookmarks.map((b) => ({
    id: b.id, user_id: uid, document_id: docId,
    virtual_index: b.virtualIndex, label: b.label, created_at: new Date(b.createdAt).toISOString(),
  })));
}

export async function fetchBookmarks(docId?: string): Promise<Bookmark[]> {
  const uid = await userId(); if (!uid) return [];
  let q = sb().from('bookmarks').select('*').eq('user_id', uid);
  if (docId) q = q.eq('document_id', docId);
  const { data } = await q.order('created_at', { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, virtualIndex: r.virtual_index,
    label: r.label, createdAt: new Date(r.created_at).getTime(),
  }));
}

// ── Key Terms ────────────────────────────────────────────────────────────────

export async function saveKeyTerms(docId: string, terms: KeyTerm[]) {
  const uid = await userId(); if (!uid) return;
  await sb().from('key_terms').delete().match({ user_id: uid, document_id: docId });
  if (terms.length === 0) return;
  await sb().from('key_terms').insert(terms.map((t) => ({
    id: t.id, user_id: uid, document_id: docId,
    term: t.term, definition: t.definition, created_at: new Date(t.createdAt).toISOString(),
  })));
}

export async function fetchKeyTerms(docId: string): Promise<KeyTerm[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('key_terms').select('*').match({ user_id: uid, document_id: docId });
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, term: r.term,
    definition: r.definition, createdAt: new Date(r.created_at).getTime(),
  }));
}

// ── Drawings ─────────────────────────────────────────────────────────────────

export async function saveDrawing(docId: string, pageKey: string, canvasData: string | null) {
  const uid = await userId(); if (!uid) return;
  if (!canvasData) {
    await sb().from('drawings').delete().match({ user_id: uid, document_id: docId, page_key: pageKey });
    return;
  }
  const { error } = await sb().from('drawings').upsert({
    id: `${uid}_${docId}_${pageKey}`,
    user_id: uid, document_id: docId, page_key: pageKey,
    canvas_data: canvasData, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,document_id,page_key' });
  if (error) console.error('[DB] saveDrawing error:', error.message, 'docId:', docId, 'pageKey:', pageKey);
  else console.log('[DB] saveDrawing OK — docId:', docId, 'pageKey:', pageKey);
}

export async function fetchDrawings(docId: string): Promise<Record<string, string>> {
  const uid = await userId();
  console.log('[DB] fetchDrawings uid:', uid, 'docId:', docId);
  if (!uid) return {};
  const { data, error } = await sb().from('drawings').select('page_key, canvas_data').match({ user_id: uid, document_id: docId });
  console.log('[DB] fetchDrawings rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  const map: Record<string, string> = {};
  for (const r of data ?? []) if (r.canvas_data) map[r.page_key] = r.canvas_data;
  return map;
}

// ── Blank Pages ───────────────────────────────────────────────────────────────

export async function saveBlankPages(docId: string, pages: BlankPage[]) {
  const uid = await userId(); if (!uid) return;
  await sb().from('blank_pages').delete().match({ user_id: uid, document_id: docId });
  if (pages.length === 0) return;
  await sb().from('blank_pages').insert(pages.map((p) => ({
    id: p.id, user_id: uid, document_id: docId,
    insert_after_page: p.insertAfterPage, canvas_data: p.canvasData ?? null,
    bg_theme: p.bgTheme ?? 'white', created_at: p.createdAt,
  })));
}

export async function fetchBlankPages(docId: string): Promise<BlankPage[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('blank_pages').select('*').match({ user_id: uid, document_id: docId });
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id, insertAfterPage: r.insert_after_page,
    canvasData: r.canvas_data, bgTheme: r.bg_theme as 'white' | 'dark', createdAt: r.created_at,
  }));
}

// ── Session State ─────────────────────────────────────────────────────────────

export async function saveSessionState(docId: string, virtualIndex: number) {
  const uid = await userId(); if (!uid) return;
  await sb().from('session_state').upsert({
    user_id: uid, doc_id: docId, virtual_index: virtualIndex,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
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
