import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS for the engine's API when the site is served from another origin
 * (e.g. the site on Vercel, the engine on Railway). Set on the engine:
 *   ALLOWED_ORIGINS=https://www.treeterminal.fun,https://treeterminal.fun
 */
const allowed = (process.env.ALLOWED_ORIGINS ?? 'https://www.treeterminal.fun,https://treeterminal.fun')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

/** Set on the frontend (Vercel) build: engine API calls belong to the engine, not here. */
const ENGINE = (process.env.NEXT_PUBLIC_ENGINE_URL || (process.env.VERCEL ? 'https://engine.treeterminal.fun' : '')).replace(/\/$/, '');
const ENGINE_ROUTES = /^\/api\/(world|events|config|health|plant|claim|media)(\/|$)/;

export function middleware(req: NextRequest) {
  if (ENGINE && ENGINE_ROUTES.test(req.nextUrl.pathname)) {
    // never start a second engine on the frontend; send the caller to the real one
    return NextResponse.redirect(`${ENGINE}${req.nextUrl.pathname}${req.nextUrl.search}`, 307);
  }
  const origin = req.headers.get('origin');
  const ok = origin && allowed.includes(origin);
  if (req.method === 'OPTIONS') {
    if (!ok) return new NextResponse(null, { status: 403 });
    return new NextResponse(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'origin',
      },
    });
  }
  const res = NextResponse.next();
  if (ok) {
    res.headers.set('access-control-allow-origin', origin);
    res.headers.set('vary', 'origin');
  }
  return res;
}

export const config = { matcher: '/api/:path*' };
