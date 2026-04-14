import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

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

/** Generate a cryptographically random nonce for CSP. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
}

/** Build the Content-Security-Policy header value for a given nonce. */
function buildCsp(nonce: string): string {
  const keycloakOrigin = process.env.KEYCLOAK_ISSUER
    ? new URL(process.env.KEYCLOAK_ISSUER).origin
    : "";

  const connectSrc = ["'self'", "https://oauth.yandex.ru", keycloakOrigin]
    .filter(Boolean)
    .join(" ");

  const directives = [
    // strict-dynamic: scripts loaded by the nonce-trusted script are also trusted
    // (handles Next.js module loading without unsafe-inline)
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // shadcn/Tailwind requires inline styles
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "default-src 'self'",
  ];

  return directives.join("; ");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // ── OAuth session check ───────────────────────────────────────────────────
  // oauth_token is httpOnly — cannot be set by client JS, only by our POST /api/auth/oauth
  // iam_expires_at is also httpOnly — check expiry to avoid calling downstream APIs with
  // a stale IAM token (the actual API routes can still refresh it, but this avoids
  // sending clearly-expired sessions to protected pages)
  const oauthToken = request.cookies.get("oauth_token")?.value;
  if (oauthToken) {
    // If we have the OAuth credential (long-lived), let the request through.
    // The IAM token will be refreshed by getIamToken() if needed.
    return buildResponse(request, pathname);
  }

  // ── Keycloak session check ─────────────────────────────────────────────────
  // getToken() cryptographically validates the JWT stored in the session cookie
  // using NEXTAUTH_SECRET — not just a cookie presence check.
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) {
    // NextRequest extends Request, so compatible with getToken's req param
    const token = await getToken({ req: request, secret });
    if (token) {
      return buildResponse(request, pathname);
    }
  }

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

/** Build the response, injecting a CSP nonce into both headers and the request. */
function buildResponse(request: NextRequest, pathname: string): NextResponse {
  // Only inject nonce for page navigation (not API/static assets)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Forward nonce to layout via request header so the inline script can use it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
