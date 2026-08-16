import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js Middleware — route protection.
 *
 * Strategy: Check for `session_active` indicator cookie (non-sensitive, non-httpOnly).
 * This cookie is set after successful login (in login-form.tsx) and cleared on logout.
 * It contains no token data — it's purely a routing signal.
 *
 * The actual authentication is validated server-side via /api/v1/auth/me on page mount.
 * The httpOnly refresh_token cookie is sent automatically on every API request.
 *
 * Why not verify the JWT here?
 * - Middleware runs on the Edge — no access to Node.js crypto for RS256 verification
 * - The public key would need to be bundled into the Edge runtime (large)
 * - The AuthProvider handles silent refresh transparently
 */

const PUBLIC_PATHS = new Set([
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/mfa',
  '/apply',
  '/api/health',
]);

const AUTH_REDIRECT_PATHS = new Set(['/auth/login', '/auth/forgot-password', '/auth/reset-password']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.has('session_active');

  // Auth pages are public, but an already-authenticated user should not be
  // routed back into login/reset flows. This check must run before the generic
  // public-path early return.
  if (AUTH_REDIRECT_PATHS.has(pathname) && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Allow all public paths, static files, and Next.js internals
  if (
    PUBLIC_PATHS.has(pathname) || pathname.startsWith('/apply') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.') // static files (favicon, images, etc.)
  ) {
    return NextResponse.next();
  }

  // ── Redirect unauthenticated users to login ────────────────────────────────
  if (!hasSession) {
    const loginUrl = new URL('/auth/login', request.url);
    // Preserve the intended destination for post-login redirect
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png).*)',
  ],
};
