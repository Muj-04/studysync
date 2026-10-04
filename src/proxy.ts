import { isAllowedOrigin, protectedPaths, safeReturnPath } from './lib/accessPolicy';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── CORS for /api routes ────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    const originAllowed = isAllowedOrigin(origin, process.env.NODE_ENV === 'production');

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

  const authPaths = ['/login', '/register'];

  // Skip server-side auth redirect for Capacitor/Android WebView —
  // the WebView may not forward cookies properly, so client-side
  // auth check handles the redirect instead.
  const ua = request.headers.get('user-agent') || '';
  const isCapacitor = ua.includes('StudySync/');

  if (!isCapacitor) {
    if (!user && protectedPaths.some((p) => (pathname === p || pathname.startsWith(`${p}/`)))) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (user && authPaths.some((p) => (pathname === p || pathname.startsWith(`${p}/`)))) {
      return NextResponse.redirect(new URL(safeReturnPath(request.nextUrl.searchParams.get('redirect')), request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
