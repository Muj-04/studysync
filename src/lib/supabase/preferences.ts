import { sb, userId } from './dbShared';

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

