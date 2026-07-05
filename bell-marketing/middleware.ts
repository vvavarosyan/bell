import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Force page DOCUMENTS to always revalidate.
//
// THE fix for the whole marketing-Bella-voice saga (Val 2026-07-04): Next's
// default Cache-Control for statically rendered App-Router pages is
// `s-maxage=31536000, stale-while-revalidate` (one YEAR). Railway's edge — and
// the browser's heuristic cache — therefore kept serving OLD HTML after every
// deploy, which loads the OLD content-hashed JS bundle, so every shipped fix
// (the Web Audio voice fix, etc.) never actually ran in the browser. Confirmed
// live: the fresh origin bundle HAD the fix, but the loaded page ran old code.
//
// next.config `headers()` could NOT override this (Next's static-page
// Cache-Control wins). Middleware runs per-request and its `set` DOES override,
// so documents now always revalidate → a new deploy's chunks are picked up
// immediately. Hashed /_next/static assets are excluded by the matcher below,
// so they keep their immutable long cache — this only touches HTML documents.
export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-cache, must-revalidate');
  return res;
}

export const config = {
  // Match everything EXCEPT hashed static assets, images, favicon, and any path
  // that ends in a file extension (fonts, sitemaps, robots, etc.).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
