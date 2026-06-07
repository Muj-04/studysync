export const KEYS = {
  VOICE_NOTES:      'studysync_voicenotes',
  DRAWINGS:         'studysync_drawings',
  TEXT_NOTES:       'studysync_textnotes',
  BLANK_PAGES:      'studysync_blankpages',
  SESSION:          'studysync_session',
  ZOOM:             'studysync_zoom',
  THEME:            'studysync_theme',
  DOC_MAP:          'studysync_docmap',
  KEY_TERMS:        'studysync_keyterms',
  BOOKMARKS:        'studysync_bookmarks',
  PAGE_IMAGES:      'studysync_page_images',
  // Settings page preferences
  FONT_SIZE:        'studysync_font_size',
  ACCENT_COLOR:     'studysync_accent_color',
  VIEW_MODE:        'studysync_view_mode',
  DEFAULT_ZOOM:     'studysync_default_zoom',
  DEFAULT_BG:       'studysync_default_bg',
  NOTIF_ROOM_JOIN:  'studysync_notif_room_join',
  BG_COLOR:         'studysync_bg_color',
  SIDEBAR_COLOR:    'studysync_sidebar_color',
  FONT_FAMILY:      'studysync_font_family',
} as const;

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storageSet<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
