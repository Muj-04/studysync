import { assertDocumentOwner } from './documentProtocol';
import { sb, userId } from './dbShared';
import { getMyPrivateProfile } from './profiles';

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

/** Bytes counted against the plan's storage quota (voice notes + room PDFs), as the database counts them. */
export async function getStorageBytesUsed(): Promise<number> {
  const uid = await userId(); if (!uid) return 0;
  const { data, error } = await sb().rpc('get_my_storage_bytes');
  if (error) throw error;
  return Number(data ?? 0);
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
  storageBytes: number;
  aiRequestsThisMonth: number;
  plan: 'free' | 'premium' | 'pro';
  isVip: boolean;
}> {
  const uid = await userId();
  if (!uid) return { documents: 0, storageBytes: 0, aiRequestsThisMonth: 0, plan: 'free', isVip: false };
  const month = new Date().toISOString().slice(0, 7);
  const [docsRes, storageBytes, aiRes, profileRes] = await Promise.all([
    sb().from('documents').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    getStorageBytesUsed().catch(() => 0),
    sb().from('ai_usage').select('count').eq('user_id', uid).eq('month', month).maybeSingle(),
    getMyPrivateProfile(),
  ]);
  return {
    documents: docsRes.count ?? 0,
    storageBytes,
    aiRequestsThisMonth: aiRes.data?.count ?? 0,
    plan: (profileRes?.plan ?? 'free') as 'free' | 'premium' | 'pro',
    isVip: profileRes?.is_vip ?? false,
  };
}

export async function deleteAllVoiceNotesForUser(): Promise<void> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to delete voice notes');
  const { error } = await sb().from('voice_notes').delete().eq('user_id', uid);
  if (error) throw error;
}

export async function deleteAllDrawingsForUser(): Promise<void> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to delete drawings');
  await assertDocumentOwner(uid);
  const { error } = await sb().rpc('clear_account_drawings_v2', { p_expected_owner: uid });
  if (error) throw error;
  await assertDocumentOwner(uid);
}

export async function exportAllUserData(): Promise<object> {
  const uid = await userId(); if (!uid) throw new Error('Sign in to export your data');
  const [docsRes, vnRes, tnRes, bmRes, ktRes] = await Promise.all([
    sb().from('documents').select('id, name, type, page_count').eq('user_id', uid),
    sb().from('voice_notes').select('id, document_id, page_number, duration, title, timestamp').eq('user_id', uid),
    sb().from('text_notes').select('id, document_id, page_key, content, x, y').eq('user_id', uid),
    sb().from('bookmarks').select('id, document_id, virtual_index, label, created_at').eq('user_id', uid),
    sb().from('key_terms').select('id, document_id, term, definition, created_at').eq('user_id', uid),
  ]);
  if ([docsRes, vnRes, tnRes, bmRes, ktRes].some(result => result.error)) {
    throw new Error('Could not export data. Please try again.');
  }
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
    const client = sb();
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) return { error: 'Please sign in again before deleting your account.' };
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) return { error: 'Account deletion was not completed. Please try again.' };
    return { error: null };
  } catch (e) {
    console.error('[DB] deleteUserAccount request failed:', e);
    return { error: 'Account deletion failed. Please try again.' };
  }
}

