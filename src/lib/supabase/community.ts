import { requireDocumentGeneration, assertDocumentOwner } from './documentProtocol';
import { sb, userId } from './dbShared';

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
  const document_generation = post.documentId ? await requireDocumentGeneration(uid, post.documentId) : null;
  await assertDocumentOwner(uid);
  const { data, error } = await sb()
    .from('community_posts')
    .insert({ user_id: uid, document_id: post.documentId, document_generation, title, description, pages: post.pages, tags })
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

