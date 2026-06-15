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

export async function deleteAllVoiceNotesForDocument(docId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { data } = await sb().from('voice_notes').select('id').match({ user_id: uid, document_id: docId });
  if (data?.length) {
    const exts = ['webm', 'ogg', 'mp4'];
    const paths = data.flatMap((r) => exts.map((e) => `${uid}/${docId}/${r.id}.${e}`));
    await sb().storage.from('voice-notes').remove(paths);
    await sb().from('voice_notes').delete().match({ user_id: uid, document_id: docId });
  }
}

export async function deleteAllDataForDocument(docId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await deleteAllVoiceNotesForDocument(docId);
  await Promise.all([
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
  await sb().from('documents').delete().eq('id', docId);
  // Remove from in-process cache so a re-add starts fresh
  registeredDocs.delete(docId);
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
  const uid = await userId(); if (!uid) return;
  await Promise.all([
    sb().from('voice_notes').delete().eq('document_id', docId).eq('user_id', uid),
    sb().from('drawings').delete().eq('document_id', docId).eq('user_id', uid),
    sb().from('text_notes').delete().eq('document_id', docId).eq('user_id', uid),
    sb().from('bookmarks').delete().eq('document_id', docId).eq('user_id', uid),
    sb().from('key_terms').delete().eq('document_id', docId).eq('user_id', uid),
  ]);
  await sb().from('documents').delete().eq('id', docId).eq('user_id', uid);
}

// ── Community ─────────────────────────────────────────────────────────────────

export interface CommunityPage {
  pageKey: string;
  textNotes: Array<{ content: string; x: number; y: number }>;
  canvasData: string | null;
}

export interface CommunityPost {
  id: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
  documentId: string | null;
  title: string;
  description: string;
  pages: CommunityPage[];
  tags: string[];
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
  comments: CommunityComment[];
}

export interface CommunityComment {
  id: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
  content: string;
  createdAt: string;
}

export type CommunityFeedTab = 'latest' | 'top' | 'trending' | 'following';

export async function fetchCommunityPosts(opts: {
  tab?: CommunityFeedTab;
  tag?: string | null;
  followingIds?: string[];
  ids?: string[];
} = {}): Promise<CommunityPost[]> {
  const uid = await userId();
  const { tab = 'latest', tag = null, followingIds, ids } = opts;

  let query = sb()
    .from('community_posts')
    .select('id, user_id, document_id, title, description, pages, tags, likes_count, created_at');

  if (tab === 'trending') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', sevenDaysAgo).order('likes_count', { ascending: false });
  } else if (tab === 'top') {
    query = query.order('likes_count', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (tab === 'following' && followingIds) {
    if (!followingIds.length) return [];
    query = query.in('user_id', followingIds);
  }

  if (tag) query = query.contains('tags', [tag]);
  if (ids?.length) query = query.in('id', ids);

  const { data: posts } = await query.limit(ids?.length ?? 60);
  if (!posts?.length) return [];

  const authorIds = [...new Set(posts.map((p) => p.user_id))];
  const { data: profiles } = await sb().from('profiles').select('id, username, avatar_url, is_vip').in('id', authorIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const postIds = posts.map((p) => p.id);
  const [likesRes, commentsRes] = await Promise.all([
    uid ? sb().from('post_likes').select('post_id').eq('user_id', uid).in('post_id', postIds) : Promise.resolve({ data: [] }),
    sb().from('post_comments').select('id, post_id, user_id, content, created_at').in('post_id', postIds).order('created_at', { ascending: true }),
  ]);

  const likedSet = new Set((likesRes.data ?? []).map((l: { post_id: string }) => l.post_id));

  const commentAuthorIds = [...new Set((commentsRes.data ?? []).map((c: { user_id: string }) => c.user_id))];
  const { data: commentProfiles } = commentAuthorIds.length
    ? await sb().from('profiles').select('id, username, avatar_url, is_vip').in('id', commentAuthorIds)
    : { data: [] };
  const cpMap = new Map((commentProfiles ?? []).map((p) => [p.id, p]));

  const commentsByPost = new Map<string, CommunityComment[]>();
  for (const c of (commentsRes.data ?? []) as Array<{ id: string; post_id: string; user_id: string; content: string; created_at: string }>) {
    if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
    const cp = cpMap.get(c.user_id);
    commentsByPost.get(c.post_id)!.push({
      id: c.id, userId: c.user_id,
      username: cp?.username ?? null, avatarUrl: cp?.avatar_url ?? null,
      isVip: cp?.is_vip ?? false,
      content: c.content, createdAt: c.created_at,
    });
  }

  return posts.map((p) => {
    const pr = profileMap.get(p.user_id);
    return {
      id: p.id, userId: p.user_id,
      username: pr?.username ?? null, avatarUrl: pr?.avatar_url ?? null,
      isVip: pr?.is_vip ?? false,
      documentId: p.document_id ?? null,
      title: p.title, description: p.description,
      pages: (p.pages as CommunityPage[]) ?? [],
      tags: (p.tags as string[]) ?? [],
      likesCount: p.likes_count, likedByMe: likedSet.has(p.id),
      createdAt: p.created_at,
      comments: commentsByPost.get(p.id) ?? [],
    };
  });
}

export async function createCommunityPost(post: {
  documentId: string | null;
  title: string;
  description: string;
  pages: CommunityPage[];
  tags?: string[];
}): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const { sanitizeText } = await import('@/lib/sanitize');
  const title       = sanitizeText(post.title).slice(0, 200);
  const description = sanitizeText(post.description).slice(0, 2000);
  const tags        = (post.tags ?? []).map((t) => sanitizeText(t).slice(0, 50)).filter(Boolean);
  const { data, error } = await sb()
    .from('community_posts')
    .insert({ user_id: uid, document_id: post.documentId, title, description, pages: post.pages, tags })
    .select('id').single();
  if (error) { console.error('[DB] createCommunityPost error:', error.message); return null; }
  return data.id;
}

export async function togglePostLike(postId: string): Promise<boolean> {
  const { data, error } = await sb().rpc('toggle_post_like', { p_post_id: postId });
  if (error) { console.error('[DB] togglePostLike error:', error.message); return false; }
  return data as boolean;
}

export async function addPostComment(postId: string, content: string): Promise<CommunityComment | null> {
  const uid = await userId(); if (!uid) return null;
  const { sanitizeText } = await import('@/lib/sanitize');
  const safeContent = sanitizeText(content).slice(0, 1000);
  if (!safeContent) return null;
  const { data, error } = await sb()
    .from('post_comments')
    .insert({ post_id: postId, user_id: uid, content: safeContent })
    .select('id, user_id, content, created_at').single();
  if (error) { console.error('[DB] addPostComment error:', error.message); return null; }
  const { data: pr } = await sb().from('profiles').select('username, avatar_url, is_vip').eq('id', uid).maybeSingle();
  return {
    id: data.id, userId: uid,
    username: pr?.username ?? null, avatarUrl: pr?.avatar_url ?? null,
    isVip: pr?.is_vip ?? false,
    content: data.content, createdAt: data.created_at,
  };
}

export async function deletePostComment(commentId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('post_comments').delete().eq('id', commentId).eq('user_id', uid);
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('community_posts').delete().eq('id', postId).eq('user_id', uid);
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
    audio_size_bytes: note.audioBlob?.size ?? 0,
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

export async function getTotalVoiceStorageBytes(): Promise<number> {
  const uid = await userId(); if (!uid) return 0;
  const { data } = await sb()
    .from('voice_notes')
    .select('audio_size_bytes')
    .eq('user_id', uid);
  return (data ?? []).reduce((sum, r) => sum + (r.audio_size_bytes ?? 0), 0);
}

export async function getMonthlyAiUsage(): Promise<number> {
  const uid = await userId(); if (!uid) return 0;
  const month = new Date().toISOString().slice(0, 7);
  const { data } = await sb()
    .from('ai_usage')
    .select('count')
    .eq('user_id', uid)
    .eq('month', month)
    .maybeSingle();
  return data?.count ?? 0;
}

export async function getLimitUsageStats(): Promise<{
  documents: number;
  voiceStorageBytes: number;
  aiRequestsThisMonth: number;
  plan: 'free' | 'premium' | 'pro';
  isVip: boolean;
}> {
  const uid = await userId();
  if (!uid) return { documents: 0, voiceStorageBytes: 0, aiRequestsThisMonth: 0, plan: 'free', isVip: false };
  const month = new Date().toISOString().slice(0, 7);
  const [docsRes, vnRes, aiRes, profileRes] = await Promise.all([
    sb().from('documents').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    sb().from('voice_notes').select('audio_size_bytes').eq('user_id', uid),
    sb().from('ai_usage').select('count').eq('user_id', uid).eq('month', month).maybeSingle(),
    sb().from('profiles').select('plan, is_vip').eq('id', uid).maybeSingle(),
  ]);
  return {
    documents: docsRes.count ?? 0,
    voiceStorageBytes: (vnRes.data ?? []).reduce((s, r) => s + (r.audio_size_bytes ?? 0), 0),
    aiRequestsThisMonth: aiRes.data?.count ?? 0,
    plan: (profileRes.data?.plan ?? 'free') as 'free' | 'premium' | 'pro',
    isVip: profileRes.data?.is_vip ?? false,
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

// ── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<{
  username: string | null;
  avatarUrl: string | null;
  plan: 'free' | 'premium' | 'pro';
  isVip: boolean;
} | null> {
  const uid = await userId(); if (!uid) return null;
  const { data } = await sb()
    .from('profiles')
    .select('username, avatar_url, plan, is_vip')
    .eq('id', uid)
    .maybeSingle();
  return data ? {
    username: data.username ?? null,
    avatarUrl: data.avatar_url ?? null,
    plan: (data.plan ?? 'free') as 'free' | 'premium' | 'pro',
    isVip: data.is_vip ?? false,
  } : null;
}

export async function updateUserPlan(plan: 'free' | 'premium' | 'pro'): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('profiles').update({ plan }).eq('id', uid);
}

export async function upsertProfile(profile: { username?: string; avatarUrl?: string }): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { sanitizeText } = await import('@/lib/sanitize');
  const update: Record<string, string | null> = {};
  if ('username' in profile) update.username = profile.username ? sanitizeText(profile.username).slice(0, 50) || null : null;
  if ('avatarUrl' in profile) update.avatar_url = profile.avatarUrl || null;
  const { error } = await sb().from('profiles').upsert({ id: uid, ...update }, { onConflict: 'id' });
  if (error) console.error('[DB] upsertProfile error:', error.message);
}

// Creates a profile row for OAuth users on first sign-in if one doesn't exist.
// Safe to call on every login — ignoreDuplicates prevents overwrites.
export async function ensureProfile(): Promise<void> {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return;
  const existing = await sb().from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (existing.data) return; // already exists
  const meta = user.user_metadata ?? {};
  const username =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    (meta.preferred_username as string | undefined) ??
    user.email?.split('@')[0] ??
    null;
  const avatarUrl =
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined) ??
    null;
  const { error } = await sb()
    .from('profiles')
    .upsert({ id: user.id, username, avatar_url: avatarUrl }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('[DB] ensureProfile error:', error.message);
}

// ── Referrals ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://pdf-study-workspace.vercel.app';

function makeReferralCode(uid: string): string {
  return uid.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export async function ensureReferralCode(): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const { data } = await sb().from('profiles').select('referral_code').eq('id', uid).maybeSingle();
  if (data?.referral_code) return data.referral_code as string;
  const code = makeReferralCode(uid);
  await sb().from('profiles').update({ referral_code: code }).eq('id', uid);
  return code;
}

export async function processReferral(referralCode: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const code = referralCode.trim().toUpperCase();
  const { data: referrer } = await sb()
    .from('profiles').select('id').eq('referral_code', code).maybeSingle();
  if (!referrer || referrer.id === uid) return;
  // Idempotent — unique constraint prevents duplicates
  const { error } = await sb().from('referrals').upsert(
    { referrer_id: referrer.id, referred_id: uid },
    { onConflict: 'referrer_id,referred_id', ignoreDuplicates: true },
  );
  if (error) { console.error('[DB] processReferral insert error:', error.message); return; }
  // Grant 7-day premium to both
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await Promise.all([
    sb().from('profiles').update({ plan: 'premium', referral_expires_at: expiresAt }).eq('id', referrer.id),
    sb().from('profiles').update({ plan: 'premium', referral_expires_at: expiresAt }).eq('id', uid),
    sb().from('referrals').update({ reward_granted: true })
      .eq('referrer_id', referrer.id).eq('referred_id', uid),
  ]);
}

export async function getReferralStats(): Promise<{
  referralCode: string | null;
  referralLink: string | null;
  referralCount: number;
  rewardActive: boolean;
  rewardExpiresAt: string | null;
} | null> {
  const uid = await userId(); if (!uid) return null;
  const [profileRes, countRes] = await Promise.all([
    sb().from('profiles').select('referral_code, referral_expires_at').eq('id', uid).maybeSingle(),
    sb().from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', uid),
  ]);
  const code = (profileRes.data?.referral_code as string | null) ?? null;
  const expiresAt = (profileRes.data?.referral_expires_at as string | null) ?? null;
  return {
    referralCode: code,
    referralLink: code ? `${BASE_URL}/register?ref=${code}` : null,
    referralCount: countRes.count ?? 0,
    rewardActive: expiresAt ? new Date(expiresAt) > new Date() : false,
    rewardExpiresAt: expiresAt,
  };
}

export async function uploadAvatar(file: File): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${uid}/avatar.${ext}`;
  const { error } = await sb().storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) { console.error('[DB] uploadAvatar error:', error.message); return null; }
  // Bust the cache so the new image is served immediately (append a timestamp)
  const { data } = sb().storage.from('avatars').getPublicUrl(path);
  return data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
}

// ── Study Rooms ───────────────────────────────────────────────────────────────

export async function uploadRoomPdf(roomId: string, blob: Blob, docName: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  if (blob.size > 50 * 1024 * 1024) { console.error('[DB] uploadRoomPdf: file too large'); return null; }
  // Verify PDF magic bytes (%PDF)
  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46) {
    console.error('[DB] uploadRoomPdf: invalid PDF magic bytes');
    return null;
  }
  const path = `${uid}/rooms/${roomId}/${docName}.pdf`;
  const { error } = await sb().storage.from('pdfs').upload(path, blob, {
    contentType: 'application/pdf', upsert: true,
  });
  if (error) { console.error('[DB] uploadRoomPdf error:', error.message); return null; }
  return path;
}

export async function createRoom(roomId: string, docName: string, pdfPath: string, maxMembers: number = 5): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await sb().from('study_rooms').insert({
    id: roomId, host_user_id: uid, document_name: docName, pdf_path: pdfPath,
    status: 'active', max_members: maxMembers, expires_at: expiresAt,
  });
  if (error) { console.error('[DB] createRoom error:', error.message); return null; }
  return roomId;
}

export async function fetchRoom(roomId: string): Promise<{
  id: string; documentName: string; pdfPath: string; hostUserId: string;
  status: 'active' | 'closed'; maxMembers: number; expiresAt: string | null;
} | null> {
  const { data, error } = await sb().from('study_rooms').select('*').eq('id', roomId).single();
  if (error || !data) { console.error('[DB] fetchRoom error:', error?.message); return null; }
  return {
    id: data.id, documentName: data.document_name, pdfPath: data.pdf_path, hostUserId: data.host_user_id,
    status: (data.status ?? 'active') as 'active' | 'closed',
    maxMembers: data.max_members ?? 10,
    expiresAt: data.expires_at ?? null,
  };
}

export async function joinRoom(roomId: string): Promise<{ error?: string }> {
  const uid = await userId(); if (!uid) return { error: 'unauthenticated' };

  // Re-joining: allow existing members through without capacity check
  const { data: existing } = await sb().from('room_members')
    .select('user_id').eq('room_id', roomId).eq('user_id', uid).maybeSingle();

  if (!existing) {
    const [{ count }, { data: room }] = await Promise.all([
      sb().from('room_members').select('user_id', { count: 'exact', head: true }).eq('room_id', roomId),
      sb().from('study_rooms').select('max_members, status').eq('id', roomId).maybeSingle(),
    ]);
    if (room?.status === 'closed') return { error: 'closed' };
    if ((count ?? 0) >= (room?.max_members ?? 10)) return { error: 'full' };
  }

  await sb().from('room_members').upsert(
    { room_id: roomId, user_id: uid },
    { onConflict: 'room_id,user_id' },
  );
  return {};
}

export async function leaveRoom(roomId: string): Promise<{ wasLastMember: boolean }> {
  const uid = await userId(); if (!uid) return { wasLastMember: false };
  await sb().from('room_members').delete().eq('room_id', roomId).eq('user_id', uid);
  const { count } = await sb().from('room_members')
    .select('user_id', { count: 'exact', head: true }).eq('room_id', roomId);
  if ((count ?? 0) === 0) {
    await sb().from('study_rooms').update({ status: 'closed' }).eq('id', roomId);
    return { wasLastMember: true };
  }
  return { wasLastMember: false };
}

export async function closeRoom(roomId: string): Promise<void> {
  await sb().from('study_rooms').update({ status: 'closed' }).eq('id', roomId);
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

export async function fetchAllRoomDrawings(roomId: string): Promise<Array<{ pageNumber: number; data: string }>> {
  const { data, error } = await sb()
    .from('room_drawings')
    .select('page_number, data')
    .eq('room_id', roomId);
  if (error) { console.error('[DB] fetchAllRoomDrawings error:', error.message); return []; }
  return (data ?? []).map((row) => ({ pageNumber: row.page_number as number, data: row.data as string }));
}

// ── Friends ───────────────────────────────────────────────────────────────────

export interface UserResult {
  id: string;
  username: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface FriendEntry {
  friendshipId: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
}

export interface FriendRequest {
  friendshipId: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
  createdAt: string;
}

export interface MyFriendship {
  friendshipId: string;
  otherUserId: string;
  status: 'pending' | 'accepted';
  isSender: boolean;
}

export async function searchUsers(query: string): Promise<UserResult[]> {
  if (!query.trim()) return [];
  const { data, error } = await sb().rpc('search_users', { search_query: query.trim() });
  if (error) { console.error('[DB] searchUsers error:', error.message); return []; }
  return (data ?? []).map((r: { id: string; username: string | null; email: string; avatar_url: string | null }) => ({
    id: r.id, username: r.username, email: r.email, avatarUrl: r.avatar_url,
  }));
}

export async function sendFriendRequest(receiverId: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const { data, error } = await sb()
    .from('friendships')
    .insert({ requester_id: uid, receiver_id: receiverId })
    .select('id').single();
  if (error) { console.error('[DB] sendFriendRequest error:', error.message); return null; }
  const { data: myProfile } = await sb().from('profiles').select('username, avatar_url').eq('id', uid).maybeSingle();
  await sb().from('notifications').insert({
    user_id: receiverId, type: 'friend_request',
    data: {
      friendship_id: data.id, requester_id: uid,
      requester_name: myProfile?.username ?? null,
      requester_avatar: myProfile?.avatar_url ?? null,
    },
  });
  return data.id;
}

export async function cancelFriendRequest(friendshipId: string): Promise<void> {
  await sb().from('friendships').delete().eq('id', friendshipId);
}

export async function respondFriendRequest(
  friendshipId: string,
  status: 'accepted' | 'rejected',
): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { data: friendship, error } = await sb()
    .from('friendships').update({ status })
    .eq('id', friendshipId)
    .select('requester_id').maybeSingle();
  if (error || !friendship) return;
  if (status === 'accepted') {
    const { data: myProfile } = await sb().from('profiles').select('username, avatar_url').eq('id', uid).maybeSingle();
    await sb().from('notifications').insert({
      user_id: friendship.requester_id, type: 'friend_accepted',
      data: {
        friendship_id: friendshipId, accepter_id: uid,
        accepter_name: myProfile?.username ?? null,
        accepter_avatar: myProfile?.avatar_url ?? null,
      },
    });
  }
}

export async function removeFriend(friendshipId: string): Promise<void> {
  await sb().from('friendships').delete().eq('id', friendshipId);
}

export async function getFriends(): Promise<FriendEntry[]> {
  const uid = await userId(); if (!uid) return [];
  const { data: friendships } = await sb()
    .from('friendships').select('id, requester_id, receiver_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`);
  if (!friendships?.length) return [];
  const otherIds = friendships.map((f) => f.requester_id === uid ? f.receiver_id : f.requester_id);
  const { data: profiles } = await sb().from('profiles').select('id, username, avatar_url, is_vip').in('id', otherIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return friendships.map((f) => {
    const otherId = f.requester_id === uid ? f.receiver_id : f.requester_id;
    const p = profileMap.get(otherId);
    return { friendshipId: f.id, userId: otherId, username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null, isVip: p?.is_vip ?? false };
  });
}

export async function getFriendRequests(): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
  const uid = await userId(); if (!uid) return { incoming: [], outgoing: [] };
  const { data: rows } = await sb()
    .from('friendships').select('id, requester_id, receiver_id, created_at')
    .eq('status', 'pending')
    .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`);
  const incoming = (rows ?? []).filter((f) => f.receiver_id === uid);
  const outgoing = (rows ?? []).filter((f) => f.requester_id === uid);
  const allOtherIds = [...new Set([...incoming.map((f) => f.requester_id), ...outgoing.map((f) => f.receiver_id)])];
  const profileMap = new Map(
    allOtherIds.length
      ? ((await sb().from('profiles').select('id, username, avatar_url, is_vip').in('id', allOtherIds)).data ?? []).map((p) => [p.id, p])
      : [],
  );
  const toReq = (f: { id: string; requester_id: string; receiver_id: string; created_at: string }, otherId: string): FriendRequest => {
    const p = profileMap.get(otherId);
    return { friendshipId: f.id, userId: otherId, username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null, isVip: p?.is_vip ?? false, createdAt: f.created_at };
  };
  return { incoming: incoming.map((f) => toReq(f, f.requester_id)), outgoing: outgoing.map((f) => toReq(f, f.receiver_id)) };
}

export async function getMyFriendships(): Promise<MyFriendship[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb()
    .from('friendships').select('id, requester_id, receiver_id, status')
    .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`)
    .in('status', ['pending', 'accepted']);
  return (data ?? []).map((f) => ({
    friendshipId: f.id,
    otherUserId: f.requester_id === uid ? f.receiver_id : f.requester_id,
    status: f.status as 'pending' | 'accepted',
    isSender: f.requester_id === uid,
  }));
}

export async function inviteToRoom(friendId: string, roomId: string, roomName: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const { data: myProfile } = await sb().from('profiles').select('username, avatar_url').eq('id', uid).maybeSingle();
  await sb().from('notifications').insert({
    user_id: friendId, type: 'room_invite',
    data: {
      room_id: roomId, room_name: roomName, inviter_id: uid,
      inviter_name: myProfile?.username ?? null,
      inviter_avatar: myProfile?.avatar_url ?? null,
    },
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export async function getNotifications(): Promise<AppNotification[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb()
    .from('notifications').select('id, type, data, read, created_at')
    .eq('user_id', uid)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(30);
  return (data ?? []).map((r) => ({
    id: r.id, type: r.type, data: r.data as Record<string, unknown>,
    read: r.read, createdAt: r.created_at,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  await sb().from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
}

export async function deleteNotification(id: string): Promise<void> {
  await sb().from('notifications').delete().eq('id', id);
}

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

// ── Study Sessions ────────────────────────────────────────────────────────────

export async function startStudySession(docId: string): Promise<string | null> {
  const uid = await userId(); if (!uid) return null;
  const { data, error } = await sb().from('study_sessions')
    .insert({ user_id: uid, document_id: docId })
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

// ── Follows ───────────────────────────────────────────────────────────────────

export async function followUser(targetId: string): Promise<void> {
  const uid = await userId(); if (!uid || uid === targetId) return;
  await sb().from('follows').upsert(
    { follower_id: uid, following_id: targetId },
    { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
  );
}

export async function unfollowUser(targetId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('follows').delete().eq('follower_id', uid).eq('following_id', targetId);
}

export async function getFollowCounts(targetId: string): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    sb().from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', targetId),
    sb().from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', targetId),
  ]);
  return { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

export async function getFollowingIds(): Promise<string[]> {
  const uid = await userId(); if (!uid) return [];
  const { data } = await sb().from('follows').select('following_id').eq('follower_id', uid);
  return (data ?? []).map((r) => r.following_id as string);
}

export async function isFollowing(targetId: string): Promise<boolean> {
  const uid = await userId(); if (!uid) return false;
  const { data } = await sb().from('follows').select('follower_id')
    .eq('follower_id', uid).eq('following_id', targetId).maybeSingle();
  return !!data;
}

// ── User Profile (public) ─────────────────────────────────────────────────────

export interface PublicProfile {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isVip: boolean;
  followersCount: number;
  followingCount: number;
  isFollowedByMe: boolean;
}

export async function getPublicProfile(targetId: string): Promise<PublicProfile | null> {
  const uid = await userId();
  const [profileRes, countsData, followingData] = await Promise.all([
    sb().from('profiles').select('username, avatar_url, is_vip').eq('id', targetId).maybeSingle(),
    getFollowCounts(targetId),
    uid && uid !== targetId ? isFollowing(targetId) : Promise.resolve(false),
  ]);
  if (!profileRes.data && !profileRes.error) return null;
  return {
    userId: targetId,
    username: profileRes.data?.username ?? null,
    avatarUrl: profileRes.data?.avatar_url ?? null,
    isVip: profileRes.data?.is_vip ?? false,
    followersCount: countsData.followers,
    followingCount: countsData.following,
    isFollowedByMe: followingData as boolean,
  };
}

export async function getUserCommunityPosts(targetId: string): Promise<CommunityPost[]> {
  const uid = await userId();
  const { data: posts } = await sb()
    .from('community_posts')
    .select('id, user_id, document_id, title, description, pages, tags, likes_count, created_at')
    .eq('user_id', targetId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (!posts?.length) return [];
  const postIds = posts.map((p) => p.id);
  const [likesRes, commentsRes] = await Promise.all([
    uid ? sb().from('post_likes').select('post_id').eq('user_id', uid).in('post_id', postIds) : Promise.resolve({ data: [] }),
    sb().from('post_comments').select('id, post_id, user_id, content, created_at').in('post_id', postIds).order('created_at', { ascending: true }),
  ]);
  const likedSet = new Set((likesRes.data ?? []).map((l: { post_id: string }) => l.post_id));
  const profileRes = await sb().from('profiles').select('username, avatar_url, is_vip').eq('id', targetId).maybeSingle();
  const commentAuthorIds = [...new Set((commentsRes.data ?? []).map((c: { user_id: string }) => c.user_id))];
  const { data: cpData } = commentAuthorIds.length
    ? await sb().from('profiles').select('id, username, avatar_url, is_vip').in('id', commentAuthorIds)
    : { data: [] };
  const cpMap = new Map((cpData ?? []).map((p) => [p.id, p]));
  const commentsByPost = new Map<string, CommunityComment[]>();
  for (const c of (commentsRes.data ?? []) as Array<{ id: string; post_id: string; user_id: string; content: string; created_at: string }>) {
    if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
    const cp = cpMap.get(c.user_id);
    commentsByPost.get(c.post_id)!.push({
      id: c.id, userId: c.user_id,
      username: cp?.username ?? null, avatarUrl: cp?.avatar_url ?? null,
      isVip: cp?.is_vip ?? false,
      content: c.content, createdAt: c.created_at,
    });
  }
  return posts.map((p) => ({
    id: p.id, userId: p.user_id,
    username: profileRes.data?.username ?? null,
    avatarUrl: profileRes.data?.avatar_url ?? null,
    isVip: profileRes.data?.is_vip ?? false,
    documentId: p.document_id ?? null,
    title: p.title, description: p.description,
    pages: (p.pages as CommunityPage[]) ?? [],
    tags: (p.tags as string[]) ?? [],
    likesCount: p.likes_count, likedByMe: likedSet.has(p.id),
    createdAt: p.created_at,
    comments: commentsByPost.get(p.id) ?? [],
  }));
}

// ── User Settings (language / study goal / privacy) ───────────────────────────

export interface UserAppSettings {
  language: 'en' | 'ar';
  dailyStudyGoalHours: number;
  communityVisibility: 'everyone' | 'friends' | 'only_me';
}

export async function getUserSettings(): Promise<UserAppSettings> {
  const uid = await userId();
  if (!uid) return { language: 'en', dailyStudyGoalHours: 2, communityVisibility: 'everyone' };
  const { data } = await sb().from('user_settings').select('*').eq('user_id', uid).maybeSingle();
  return {
    language: (data?.language ?? 'en') as 'en' | 'ar',
    dailyStudyGoalHours: data?.daily_study_goal_hours ?? 2,
    communityVisibility: (data?.community_visibility ?? 'everyone') as 'everyone' | 'friends' | 'only_me',
  };
}

export async function saveUserSettings(settings: Partial<UserAppSettings>): Promise<void> {
  const uid = await userId(); if (!uid) return;
  const update: Record<string, unknown> = { user_id: uid, updated_at: new Date().toISOString() };
  if (settings.language !== undefined) update.language = settings.language;
  if (settings.dailyStudyGoalHours !== undefined) update.daily_study_goal_hours = settings.dailyStudyGoalHours;
  if (settings.communityVisibility !== undefined) update.community_visibility = settings.communityVisibility;
  await sb().from('user_settings').upsert(update, { onConflict: 'user_id' });
}

// ── Active Sessions (single-session enforcement for premium/pro) ──────────────

export const SESSION_STORAGE_KEY = 'studysync_session_id';

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

// 'ok'        — safe to proceed (no active session, same session, free user, or session expired)
// 'conflict'  — a different active session exists on another device
// 'free_user' — user is on free plan, no enforcement needed
export async function checkActiveSession(sessionId: string): Promise<'ok' | 'conflict' | 'free_user'> {
  const uid = await userId(); if (!uid) return 'free_user';

  const { data: profile } = await sb().from('profiles').select('plan').eq('id', uid).maybeSingle();
  if (!profile || profile.plan === 'free') return 'free_user';

  const { data: existing } = await sb()
    .from('active_sessions').select('session_id, last_seen').eq('user_id', uid).maybeSingle();

  if (!existing) return 'ok';
  if (existing.session_id === sessionId) return 'ok';

  // Treat sessions silent for >24 h as expired
  if (Date.now() - new Date(existing.last_seen).getTime() > 24 * 60 * 60 * 1000) return 'ok';

  return 'conflict';
}

// Upsert the current session — overwrites any existing session for this user.
export async function registerSession(sessionId: string, deviceInfo: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('active_sessions').upsert(
    { user_id: uid, session_id: sessionId, device_info: deviceInfo, last_seen: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

export async function updateSessionLastSeen(sessionId: string): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('active_sessions')
    .update({ last_seen: new Date().toISOString() })
    .eq('user_id', uid).eq('session_id', sessionId);
}

export async function removeActiveSession(): Promise<void> {
  const uid = await userId(); if (!uid) return;
  await sb().from('active_sessions').delete().eq('user_id', uid);
}

// ── Flashcards ────────────────────────────────────────────────────────────────

export interface Flashcard {
  id: string;
  docId: string;
  pageNum: number;
  question: string;
  answer: string;
  createdAt: string;
}

export async function saveFlashcards(docId: string, pageNum: number, cards: { question: string; answer: string }[]): Promise<void> {
  const uid = await userId(); if (!uid) return;
  // Delete existing cards for this page first, then insert fresh batch
  await sb().from('flashcards').delete().eq('user_id', uid).eq('doc_id', docId).eq('page_num', pageNum);
  if (!cards.length) return;
  const rows = cards.map((c) => ({ user_id: uid, doc_id: docId, page_num: pageNum, question: c.question, answer: c.answer }));
  const { error } = await sb().from('flashcards').insert(rows);
  if (error) console.error('[DB] saveFlashcards error:', error.message);
}

export async function loadFlashcards(docId: string, pageNum: number): Promise<Flashcard[]> {
  const uid = await userId(); if (!uid) return [];
  const { data, error } = await sb()
    .from('flashcards')
    .select('id, doc_id, page_num, question, answer, created_at')
    .eq('user_id', uid)
    .eq('doc_id', docId)
    .eq('page_num', pageNum)
    .order('created_at', { ascending: true });
  if (error) { console.error('[DB] loadFlashcards error:', error.message); return []; }
  return (data ?? []).map((r) => ({
    id: r.id,
    docId: r.doc_id,
    pageNum: r.page_num,
    question: r.question,
    answer: r.answer,
    createdAt: r.created_at,
  }));
}

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
