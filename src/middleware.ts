/**
 * middleware.ts — Edge session gate for the portal.
 *
 * This checks only that the `recivis-token` cookie is *present*. It never
 * verifies the JWT: verification needs the database (permissions are read
 * per-request in api-auth.ts) and the real enforcement point is `requireAuth`
 * on every API route. Middleware exists to keep unauthenticated browsers off
 * portal URLs, not to authorise anything.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_PORTAL_PATH, LOGIN_PATH } from '@/lib/routes';

const SESSION_COOKIE = 'recivis-token';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // The design-system specimen page carries no data and 404s in production (see
  // src/app/style-preview/page.tsx). It is left ungated so the restyle can be
  // reviewed locally without a database or a Zoho key.
  if (pathname === '/style-preview') {
    return NextResponse.next();
  }

  if (pathname === LOGIN_PATH) {
    if (hasSession) {
      return NextResponse.redirect(new URL(DEFAULT_PORTAL_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    // `/` carries the password-reset link's `?reset=` token, so send it
    // straight to the login screen with its query intact rather than
    // bouncing it through `?next=`.
    const target = pathname === '/'
      ? new URL(`${LOGIN_PATH}${search}`, request.url)
      : new URL(`${LOGIN_PATH}?next=${encodeURIComponent(pathname + search)}`, request.url);
    return NextResponse.redirect(target);
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(DEFAULT_PORTAL_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals, and static files.
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
};
