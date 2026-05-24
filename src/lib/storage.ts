export const KEYS = {
  VOICE_NOTES: 'studysync_voicenotes',
  DRAWINGS:    'studysync_drawings',
  TEXT_NOTES:  'studysync_textnotes',
  BLANK_PAGES: 'studysync_blankpages',
  SESSION:     'studysync_session',
  ZOOM:        'studysync_zoom',
  THEME:       'studysync_theme',
  DOC_MAP:     'studysync_docmap',
  KEY_TERMS:   'studysync_keyterms',
  BOOKMARKS:   'studysync_bookmarks',
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
