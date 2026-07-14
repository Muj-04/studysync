import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PRODUCTION_ORIGIN = 'https://pdf-study-workspace.vercel.app';

/**
 * Vercel preview URLs for this project have the shape:
 *   per-commit:    https://pdf-study-workspace-<hash>-muj-04s-projects.vercel.app
 *   branch alias:  https://pdf-study-workspace-git-<branch>-muj-04s-projects.vercel.app
 *
 * The regex below requires the exact project slug at the start AND the exact
 * team slug (`muj-04s-projects`) at the end, so a third party cannot forge a
 * matching subdomain — Vercel team slugs are globally unique. The middle
 * segment is constrained to lowercase letters, digits, and hyphens, which
 * covers both per-commit hashes and `git-<branch>` aliases without
 * permitting wildcards that could match arbitrary content.
 */
const PREVIEW_ORIGIN_RE = /^https:\/\/pdf-study-workspace-[a-z0-9-]+-muj-04s-projects\.vercel\.app$/;

/**
 * Local dev — `npm run dev` serves at http://localhost:<port>. Only honoured
 * when the runtime is in non-production mode so a deployed instance can never
 * be tricked into allowlisting localhost via header manipulation.
 */
const LOCALHOST_ORIGIN_RE = /^http:\/\/localhost(:\d+)?$/;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === PRODUCTION_ORIGIN) return true;
  if (PREVIEW_ORIGIN_RE.test(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && LOCALHOST_ORIGIN_RE.test(origin)) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── CORS for /api routes ────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    const originAllowed = isAllowedOrigin(origin);

    // Preflight — echo the request's Origin back when it's allowlisted so
    // the browser sees a same-origin response. Reject preflights from
    // disallowed origins without a CORS header (browser will block the
    // follow-up request).
    if (request.method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age':       '86400',
      };
      if (originAllowed && origin) headers['Access-Control-Allow-Origin'] = origin;
      return new NextResponse(null, { status: 204, headers });
    }

    // Block browser requests from unexpected origins.
    // Server-to-server calls (Stripe webhooks, etc.) carry no Origin — allow them.
    if (origin && !originAllowed) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const res = NextResponse.next({ request });
    if (originAllowed && origin) {
      res.headers.set('Access-Control-Allow-Origin', origin);
    }
    return res;
  }
  // ───────────────────────────────────────────────────────────────────────────

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const protectedPaths = [
    '/workspace',
    '/dashboard',
    '/library',
    '/community',
    '/friends',
    '/settings',
    '/room',
  ];
  const authPaths = ['/login', '/register'];

  // Skip server-side auth redirect for Capacitor/Android WebView —
  // the WebView may not forward cookies properly, so client-side
  // auth check handles the redirect instead.
  const ua = request.headers.get('user-agent') || '';
  const isCapacitor = ua.includes('StudySync/');

  if (!isCapacitor) {
    if (!user && protectedPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (user && authPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
