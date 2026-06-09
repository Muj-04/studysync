import type DOMPurifyType from 'dompurify';

let _purify: typeof DOMPurifyType | null = null;

function getPurify(): typeof DOMPurifyType | null {
  if (typeof window === 'undefined') return null;
  if (!_purify) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _purify = require('dompurify') as typeof DOMPurifyType;
  }
  return _purify;
}

// Strip all HTML — returns plain text only. Safe to call server-side too.
export function sanitizeText(input: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  const purify = getPurify();
  if (purify) {
    return purify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  // Server-side fallback: strip tags with regex
  return s.replace(/<[^>]*>/g, '');
}
