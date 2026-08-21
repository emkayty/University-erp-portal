import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js route protection proxy.
 *
 * The session_active cookie is only a non-sensitive routing signal. The API
 * validates the actual httpOnly refresh-token session on authenticated calls.
 */
const PUBLIC_PATHS = new Set([
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/mfa",
  "/apply",
  "/api/health",
]);
const AUTH_REDIRECT_PATHS = new Set([
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("session_active");
  if (AUTH_REDIRECT_PATHS.has(pathname) && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/apply") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }
  if (!hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png).*)",
  ],
};
