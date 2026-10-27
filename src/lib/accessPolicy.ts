export const protectedPaths = ['/workspace', '/dashboard', '/library', '/community', '/friends', '/settings', '/room', '/flashcards', '/study-rooms'];
export const developmentHosts = ['localhost', '127.0.0.1', '10.0.2.2', '192.168.1.169'];

export function isAllowedOrigin(origin: string | null, production: boolean) {
  if (!origin) return false;
  if (origin === 'https://pdf-study-workspace.vercel.app') return true;
  if (/^https:\/\/pdf-study-workspace-[a-z0-9-]+-muj-04s-projects\.vercel\.app$/.test(origin)) return true;
  if (production) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.origin === origin && developmentHosts.includes(url.hostname);
  } catch { return false; }
}

export function safeReturnPath(value: string | null, fallback = '/dashboard') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://studysync.invalid');
    if (url.origin !== 'https://studysync.invalid') return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
