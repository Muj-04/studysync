import { createClient } from './client';
import type { VoiceNote, TextNote, Bookmark, KeyTerm, BlankPage, PDFPageImage } from '@/types';

// ── helpers ─────────────────────────────────────────────────────────────────

function sb() { return createClient(); }

async function userId(): Promise<string | null> {
  const { data: { user } } = await sb().auth.getUser();
  return user?.id ?? null;
}

// Session-scoped set of docIds that are guaranteed to exist in the documents table.
// Prevents FK violations when drawing/note saves race ahead of upsertDocument.
const registeredDocs = new Set<string>();

// Guarantees the documents row exists before any FK-dependent write.
// Uses ignoreDuplicates so it never overwrites name/type set by upsertDocument.
async function ensureDoc(uid: string, docId: string): Promise<void> {
  if (registeredDocs.has(docId)) return;
  await sb().from('documents').upsert(
    { id: docId, user_id: uid, name: docId, type: 'pdf', updated_at: new Date().toISOString() },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  registeredDocs.add(docId);
}

// ── Documents ────────────────────────────────────────────────────────────────

// Returns the canonical document ID for this user+name (cross-device stable).
// If a row with the same name already exists (opened on another device first),
// that existing ID is returned and used — the local UUID is discarded.
export async function upsertDocument(doc: { id: string; name: string; type: string; pageCount?: number }): Promise<string> {
  const uid = await userId(); if (!uid) return doc.id;

  // Look up by (user_id, name) — stable across devices regardless of local UUID
  const { data: existing } = await sb()
    .from('documents').select('id')
    .eq('user_id', uid).eq('name', doc.name)
    .maybeSingle();

  const canonicalId = existing?.id ?? doc.id;

  const { error } = await sb().from('documents').upsert({
    id: canonicalId, user_id: uid, name: doc.name, type: doc.type,
    page_count: doc.pageCount ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (error) console.error('[DB] upsertDocument error:', error.message, 'canonicalId:', canonicalId);
  else {
    console.log('[DB] upsertDocument OK — canonicalId:', canonicalId, 'localId:', doc.id, 'name:', doc.name);
    registeredDocs.add(canonicalId);
  }
  return canonicalId;
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
  const uid = await userId(); if (!uid) { console.error('[DB] saveVoiceNote — no uid, aborting'); return null; }
  console.log('[DB] saveVoiceNote start — id:', note.id, 'blob size:', note.audioBlob?.size ?? 0, 'blob mime:', note.audioBlob?.type ?? 'none');
  await ensureDoc(uid, note.documentId);

  let audioUrl: string | null = null;

  if (note.audioBlob && note.audioBlob.size > 0) {
    // Strip codecs parameter (e.g. "audio/webm;codecs=opus" → "audio/webm") so
    // the upload content-type matches the bucket's allowed_mime_types exactly.
    const mimeType = note.audioBlob.type.split(';')[0] || 'audio/webm';
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const path = `${uid}/${note.documentId}/${note.id}.${ext}`;
    console.log('[DB] saveVoiceNote uploading — path:', path, 'mimeType:', mimeType, 'size:', note.audioBlob.size);

    const { data: uploadData, error: uploadError } = await sb().storage
      .from('voice-notes')
      .upload(path, note.audioBlob, { upsert: true, contentType: mimeType });

    if (uploadError) {
      console.error('[DB] saveVoiceNote upload FAILED:', uploadError.message, '| statusCode:', (uploadError as { statusCode?: string }).statusCode, '| path:', path);
    } else {
      console.log('[DB] saveVoiceNote upload OK — path:', uploadData?.path ?? path);
      // Bucket is private — getPublicUrl always returns a string (it's URL construction
      // only, no auth check), so that URL would 403. Always use signed URL instead.
      const { data: signed, error: signError } = await sb().storage
        .from('voice-notes')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10-year TTL
      if (signError) {
        console.error('[DB] saveVoiceNote createSignedUrl FAILED:', signError.message);
      } else {
        audioUrl = signed?.signedUrl ?? null;
        console.log('[DB] saveVoiceNote signed URL:', audioUrl ? audioUrl.slice(0, 100) + '…' : 'NULL');
      }
    }
  } else {
    console.warn('[DB] saveVoiceNote — blob is empty or missing, skipping upload');
  }

  const { error: dbError } = await sb().from('voice_notes').upsert({
    id: note.id,
    user_id: uid,
    document_id: note.documentId,
    page_number: String(note.pageNumber),
    duration: note.duration,
    title: note.title ?? null,
    audio_url: audioUrl,
    timestamp: note.timestamp instanceof Date ? note.timestamp.toISOString() : note.timestamp,
  }, { onConflict: 'id' });

  if (dbError) console.error('[DB] saveVoiceNote DB upsert FAILED:', dbError.message, '| code:', dbError.code);
  else console.log('[DB] saveVoiceNote DB upsert OK — id:', note.id, 'audio_url stored:', audioUrl ? 'yes' : 'NO (null)');
  return dbError ? null : audioUrl;
}

export async function fetchVoiceNotes(docId?: string): Promise<Array<{
  id: string; documentId: string; pageNumber: number | string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
}>> {
  const uid = await userId(); if (!uid) { console.warn('[DB] fetchVoiceNotes — no uid'); return []; }
  let q = sb().from('voice_notes').select('*').eq('user_id', uid);
  if (docId) q = q.eq('document_id', docId);
  const { data, error } = await q.order('timestamp', { ascending: false });
  console.log('[DB] fetchVoiceNotes rows:', data?.length ?? 0, 'docId filter:', docId ?? 'none', 'error:', error?.message ?? null);
  if (data) {
    data.forEach((r, i) => {
      console.log(`[DB] fetchVoiceNotes [${i}] id:${r.id} doc:${r.document_id} page:${r.page_number} audio_url:${r.audio_url ? r.audio_url.slice(0, 80) + '…' : 'NULL'}`);
    });
  }
  return (data ?? []).map((r) => ({
    id: r.id, documentId: r.document_id,
    // page_number is stored as text; parse to number so it matches the numeric
    // pageIdentifier used locally (strict equality: '5' !== 5 would hide all notes)
    pageNumber: isNaN(Number(r.page_number)) ? r.page_number : Number(r.page_number),
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
  await ensureDoc(uid, docId);
  const { error: delErr } = await sb().from('text_notes').delete().match({ user_id: uid, document_id: docId, page_key: pageKey });
  if (delErr) console.error('[DB] saveTextNotes delete error:', delErr.message, 'docId:', docId, 'pageKey:', pageKey);
  if (notes.length === 0) return;
  const { error: insErr } = await sb().from('text_notes').insert(notes.map((n) => ({
    id: n.id, user_id: uid, document_id: docId, page_key: pageKey,
    x: n.x, y: n.y, width: n.width, height: n.height,
    content: n.content, font_size: n.fontSize, color: n.color,
  })));
  if (insErr) console.error('[DB] saveTextNotes insert error:', insErr.message, 'docId:', docId, 'pageKey:', pageKey);
  else console.log('[DB] saveTextNotes OK — docId:', docId, 'pageKey:', pageKey, 'count:', notes.length);
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
  await ensureDoc(uid, docId);
  const { error: delErr } = await sb().from('bookmarks').delete().match({ user_id: uid, document_id: docId });
  if (delErr) console.error('[DB] saveBookmarks delete error:', delErr.message, 'docId:', docId);
  if (bookmarks.length === 0) return;
  const { error: insErr } = await sb().from('bookmarks').insert(bookmarks.map((b) => ({
    id: b.id, user_id: uid, document_id: docId,
    virtual_index: b.virtualIndex, label: b.label, created_at: new Date(b.createdAt).toISOString(),
  })));
  if (insErr) console.error('[DB] saveBookmarks insert error:', insErr.message, 'docId:', docId);
  else console.log('[DB] saveBookmarks OK — docId:', docId, 'count:', bookmarks.length);
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
  await ensureDoc(uid, docId);
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
  await ensureDoc(uid, docId);
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

export async function deleteAllDrawings(docId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb().from('drawings').delete().match({ user_id: uid, document_id: docId });
  if (error) console.error('[DB] deleteAllDrawings error:', error.message);
  else console.log('[DB] deleteAllDrawings OK — docId:', docId);
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
  await ensureDoc(uid, docId);
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

// ── Page Image Annotations ────────────────────────────────────────────────────

export async function savePageImages(docId: string, pageNumber: number, images: PDFPageImage[]): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await ensureDoc(uid, docId);
  const { error } = await sb().from('page_image_annotations').upsert(
    { user_id: uid, document_id: docId, page_number: pageNumber, images: images as unknown as object[], updated_at: new Date().toISOString() },
    { onConflict: 'user_id,document_id,page_number' },
  );
  if (error) console.error('[DB] savePageImages error:', error.message, 'docId:', docId, 'page:', pageNumber);
}

export async function fetchAllPageImages(docId: string): Promise<Record<number, PDFPageImage[]>> {
  const uid = await userId(); if (!uid) return {};
  const { data, error } = await sb()
    .from('page_image_annotations')
    .select('page_number, images')
    .match({ user_id: uid, document_id: docId });
  if (error) { console.error('[DB] fetchAllPageImages error:', error.message); return {}; }
  const map: Record<number, PDFPageImage[]> = {};
  for (const r of data ?? []) map[r.page_number] = r.images as PDFPageImage[];
  return map;
}

// ── User storage stats & bulk operations ─────────────────────────────────────

export async function getUserStorageStats(): Promise<{
  documents: number; voiceNotes: number; drawings: number;
}> {
  const uid = await userId(); if (!uid) return { documents: 0, voiceNotes: 0, drawings: 0 };
  const [docsRes, vnRes, drRes] = await Promise.all([
    sb().from('documents').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    sb().from('voice_notes').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    sb().from('drawings').select('id', { count: 'exact', head: true }).eq('user_id', uid),
  ]);
  return {
    documents: docsRes.count ?? 0,
    voiceNotes: vnRes.count ?? 0,
    drawings: drRes.count ?? 0,
  };
}

export async function deleteAllVoiceNotesForUser(): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('voice_notes').delete().eq('user_id', uid);
}

export async function deleteAllDrawingsForUser(): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('drawings').delete().eq('user_id', uid);
}

export async function exportAllUserData(): Promise<object> {
  const uid = await userId(); if (!uid) return {};
  const [docsRes, vnRes, tnRes, bmRes, ktRes] = await Promise.all([
    sb().from('documents').select('id, name, type, page_count').eq('user_id', uid),
    sb().from('voice_notes').select('id, document_id, page_number, duration, title, timestamp').eq('user_id', uid),
    sb().from('text_notes').select('id, document_id, page_key, content, x, y').eq('user_id', uid),
    sb().from('bookmarks').select('id, document_id, virtual_index, label, created_at').eq('user_id', uid),
    sb().from('key_terms').select('id, document_id, term, definition, created_at').eq('user_id', uid),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    documents: docsRes.data ?? [],
    voiceNotes: vnRes.data ?? [],
    textNotes: tnRes.data ?? [],
    bookmarks: bmRes.data ?? [],
    keyTerms: ktRes.data ?? [],
  };
}

export async function deleteUserAccount(): Promise<{ error: string | null }> {
  try {
    const { error } = await sb().rpc('delete_user_account');
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: String(e) };
  }
}

// ── User Preferences ─────────────────────────────────────────────────────────

export interface DbUserPreferences {
  theme?: string;
  font_size?: string;
  accent_color?: string;
  bg_color?: string | null;
  sidebar_color?: string | null;
  font_family?: string;
  view_mode?: string;
  default_zoom?: number;
  default_bg?: string;
  notif_room_join?: boolean;
}

export async function loadUserPreferences(): Promise<DbUserPreferences | null> {
  const uid = await userId(); if (!uid) return null;
  const { data } = await sb()
    .from('user_preferences')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  return data ?? null;
}

export async function saveUserPreferences(prefs: Partial<DbUserPreferences>): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('user_preferences').upsert(
    { user_id: uid, ...prefs, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

export async function saveDocumentOrder(orderedIds: string[]): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('user_preferences').upsert(
    { user_id: uid, document_order: orderedIds, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

export async function loadDocumentOrder(): Promise<string[] | null> {
  const uid = await userId(); if (!uid) return null;
  const { data } = await sb()
    .from('user_preferences')
    .select('document_order')
    .eq('user_id', uid)
    .maybeSingle();
  const order = data?.document_order;
  return Array.isArray(order) ? (order as string[]) : null;
}

// ── Room Voice Notes ─────────────────────────────────────────────────────────

export async function saveRoomVoiceNote(roomId: string, note: VoiceNote): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;

  let audioUrl: string | null = null;

  if (note.audioBlob && note.audioBlob.size > 0) {
    const mimeType = note.audioBlob.type.split(';')[0] || 'audio/webm';
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const path = `rooms/${roomId}/${note.id}.${ext}`;

    const { error: uploadError } = await sb().storage
      .from('voice-notes')
      .upload(path, note.audioBlob, { upsert: true, contentType: mimeType });

    if (!uploadError) {
      const { data: signed } = await sb().storage
        .from('voice-notes')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      audioUrl = signed?.signedUrl ?? null;
    } else {
      console.error('[DB] saveRoomVoiceNote upload error:', uploadError.message);
    }
  }

  const { error } = await sb().from('room_voice_notes').upsert({
    id: note.id,
    room_id: roomId,
    user_id: uid,
    page_number: String(note.pageNumber),
    duration: note.duration,
    title: note.title ?? null,
    audio_url: audioUrl,
    timestamp: note.timestamp instanceof Date ? note.timestamp.toISOString() : note.timestamp,
  }, { onConflict: 'id' });

  if (error) console.error('[DB] saveRoomVoiceNote DB error:', error.message);
  return error ? null : audioUrl;
}

export async function fetchRoomVoiceNotes(roomId: string): Promise<Array<{
  id: string; pageNumber: number | string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
}>> {
  const { data, error } = await sb()
    .from('room_voice_notes')
    .select('id, page_number, duration, title, audio_url, timestamp')
    .eq('room_id', roomId)
    .order('timestamp', { ascending: false });
  if (error) { console.error('[DB] fetchRoomVoiceNotes error:', error.message); return []; }
  return (data ?? []).map((r) => ({
    id: r.id,
    pageNumber: isNaN(Number(r.page_number)) ? r.page_number : Number(r.page_number),
    duration: r.duration,
    title: r.title ?? undefined,
    audioUrl: r.audio_url ?? undefined,
    timestamp: r.timestamp,
  }));
}

export async function fetchSingleRoomVoiceNote(noteId: string, roomId: string): Promise<{
  id: string; pageNumber: number | string;
  duration: number; title?: string; audioUrl?: string; timestamp: string;
} | null> {
  const { data, error } = await sb()
    .from('room_voice_notes')
    .select('id, page_number, duration, title, audio_url, timestamp')
    .eq('id', noteId)
    .eq('room_id', roomId)
    .maybeSingle();
  if (error || !data) { console.error('[DB] fetchSingleRoomVoiceNote error:', error?.message); return null; }
  return {
    id: data.id,
    pageNumber: isNaN(Number(data.page_number)) ? data.page_number : Number(data.page_number),
    duration: data.duration,
    title: data.title ?? undefined,
    audioUrl: data.audio_url ?? undefined,
    timestamp: data.timestamp,
  };
}

export async function saveRoomBlankPage(
  roomId: string,
  page: { id: string; insertAfterPage: number; bgTheme: 'white' | 'dark'; createdAt: number },
): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { error } = await sb().from('room_blank_pages').upsert({
    id: page.id,
    room_id: roomId,
    insert_after_page: page.insertAfterPage,
    bg_theme: page.bgTheme,
    created_at: page.createdAt,
    created_by: uid,
  }, { onConflict: 'id' });
  if (error) console.error('[DB] saveRoomBlankPage error:', error.message);
}

export async function fetchRoomBlankPages(
  roomId: string,
): Promise<Array<{ id: string; insertAfterPage: number; bgTheme: 'white' | 'dark'; createdAt: number }>> {
  const { data, error } = await sb()
    .from('room_blank_pages')
    .select('id, insert_after_page, bg_theme, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[DB] fetchRoomBlankPages error:', error.message); return []; }
  return (data ?? []).map((r) => ({
    id: r.id,
    insertAfterPage: r.insert_after_page as number,
    bgTheme: (r.bg_theme === 'dark' ? 'dark' : 'white') as 'white' | 'dark',
    createdAt: r.created_at as number,
  }));
}

export async function deleteRoomVoiceNote(noteId: string, roomId: string): Promise<void> {
  for (const ext of ['webm', 'ogg', 'mp4']) {
    await sb().storage.from('voice-notes').remove([`rooms/${roomId}/${noteId}.${ext}`]);
  }
  await sb().from('room_voice_notes').delete().eq('id', noteId);
}

export async function updateRoomVoiceNoteTitle(noteId: string, title: string | undefined): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('room_voice_notes').update({ title: title ?? null }).eq('id', noteId).eq('user_id', uid);
}

// ── Study Rooms ───────────────────────────────────────────────────────────────

export async function uploadRoomPdf(roomId: string, blob: Blob, docName: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const path = `${uid}/rooms/${roomId}/${docName}.pdf`;
  const { error } = await sb().storage.from('pdfs').upload(path, blob, {
    contentType: 'application/pdf', upsert: true,
  });
  if (error) { console.error('[DB] uploadRoomPdf error:', error.message); return null; }
  return path;
}

export async function createRoom(roomId: string, docName: string, pdfPath: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const { error } = await sb().from('study_rooms').insert({
    id: roomId, host_user_id: uid, document_name: docName, pdf_path: pdfPath,
  });
  if (error) { console.error('[DB] createRoom error:', error.message); return null; }
  return roomId;
}

export async function fetchRoom(roomId: string): Promise<{
  id: string; documentName: string; pdfPath: string; hostUserId: string;
} | null> {
  const { data, error } = await sb().from('study_rooms').select('*').eq('id', roomId).single();
  if (error || !data) { console.error('[DB] fetchRoom error:', error?.message); return null; }
  return { id: data.id, documentName: data.document_name, pdfPath: data.pdf_path, hostUserId: data.host_user_id };
}

export async function joinRoom(roomId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('room_members').upsert(
    { room_id: roomId, user_id: uid },
    { onConflict: 'room_id,user_id' },
  );
}

export async function saveRoomDrawing(roomId: string, pageNumber: number, data: string): Promise<void> {
  const { error } = await sb().from('room_drawings').upsert(
    { room_id: roomId, page_number: pageNumber, data, updated_at: new Date().toISOString() },
    { onConflict: 'room_id,page_number' },
  );
  if (error) console.error('[DB] saveRoomDrawing error:', error.message);
}

export async function fetchRoomDrawing(roomId: string, pageNumber: number): Promise<string | null> {
  const { data, error } = await sb()
    .from('room_drawings')
    .select('data')
    .eq('room_id', roomId)
    .eq('page_number', pageNumber)
    .maybeSingle();
  if (error) { console.error('[DB] fetchRoomDrawing error:', error.message); return null; }
  return data?.data ?? null;
}
