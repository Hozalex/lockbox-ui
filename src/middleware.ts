import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { NextAuthRequest } from "next-auth";

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

/** Cryptographically random nonce for CSP (16 bytes → base64). */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
}

/** Per-request Content-Security-Policy with nonce. */
function buildCsp(nonce: string): string {
  const keycloakOrigin = process.env.KEYCLOAK_ISSUER
    ? new URL(process.env.KEYCLOAK_ISSUER).origin
    : "";

  const connectSrc = ["'self'", "https://oauth.yandex.ru", keycloakOrigin]
    .filter(Boolean)
    .join(" ");

  return [
    // strict-dynamic lets scripts loaded by the nonce-trusted script load further
    // scripts — handles Next.js module loading without unsafe-inline.
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // Tailwind/shadcn require inline styles
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "default-src 'self'",
  ].join("; ");
}

/** Attach CSP nonce to response and forward it to layout via x-nonce header. */
function withNonce(request: NextAuthRequest): NextResponse {
  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

// ── Middleware ────────────────────────────────────────────────────────────────
// Wrapping with auth() from next-auth populates request.auth only when the
// session JWT is cryptographically valid (signed with NEXTAUTH_SECRET).
// This is the recommended next-auth v5 pattern for middleware.
export default auth(function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // ── OAuth: httpOnly cookie — cannot be planted by client JS ──────────────
  const oauthToken = request.cookies.get("oauth_token")?.value;
  if (oauthToken) {
    if (pathname.startsWith("/api/")) return NextResponse.next();
    return withNonce(request);
  }

  // ── Keycloak: request.auth is non-null only if JWT signature is valid ─────
  if (request.auth) {
    if (pathname.startsWith("/api/")) return NextResponse.next();
    return withNonce(request);
  }

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
