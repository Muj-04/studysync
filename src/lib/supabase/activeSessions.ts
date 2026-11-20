import { sb, userId } from './dbShared';

// ── Active Sessions (single-session enforcement for premium/pro) ──────────────

export const SESSION_STORAGE_KEY = 'studysync_session_id';

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : ([1e7].toString() + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
          (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)
        );
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

// 'ok'        — safe to proceed (no active session, same session, free user, VIP, or session expired)
// 'conflict'  — a different active session exists on another device
// 'free_user' — user is on free plan (or VIP — VIP bypasses every limit), no enforcement needed
export async function checkActiveSession(sessionId: string): Promise<'ok' | 'conflict' | 'free_user'> {
  const uid = await userId(); if (!uid) return 'free_user';

  const { data: profile } = await sb().from('profiles').select('plan, is_vip').eq('id', uid).maybeSingle();
  if (!profile || profile.plan === 'free' || profile.is_vip) return 'free_user';

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

