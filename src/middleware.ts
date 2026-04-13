import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/",
  "/api/config",
  "/_next/",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Check OAuth session (cookie-based)
  const hasOAuth =
    request.cookies.has("oauth_token") && request.cookies.has("iam_token");
  if (hasOAuth) {
    return NextResponse.next();
  }

  // Check Keycloak session (next-auth session token cookie)
  const hasKeycloak =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");
  if (hasKeycloak) {
    return NextResponse.next();
  }

  // Not authenticated — redirect pages to login, return 401 for API
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
