import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED_ORIGIN = 'https://pdf-study-workspace.vercel.app';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const origin = req.headers.get('origin');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age':       '86400',
      },
    });
  }

  // Block browser requests from unexpected origins.
  // Server-to-server calls (Stripe webhooks, etc.) have no Origin header — allow them.
  if (origin && origin !== ALLOWED_ORIGIN) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const res = NextResponse.next();
  if (origin === ALLOWED_ORIGIN) {
    res.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  }
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
