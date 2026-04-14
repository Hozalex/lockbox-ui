import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { log } from "@/lib/logger";
import {
  OAUTH_COOKIE,
  IAM_COOKIE,
  IAM_EXPIRES_COOKIE,
  YC_IAM_ENDPOINT,
} from "@/lib/auth";
import { validateOAuthToken } from "@/lib/validation";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

// ── Rate limiting (in-memory, per IP) ────────────────────────────────────────
// Protects against brute-force OAuth token guessing.
// Not suitable for multi-instance deployments — use Redis-based limiter there.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

// ── CSRF: Origin validation ───────────────────────────────────────────────────
// Complements sameSite: lax. Rejects requests from unexpected origins.
function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // No Origin header — typically same-origin or non-browser (CLI, server). Allow.
  if (!origin) return true;

  const host = request.headers.get("host");
  if (!host) return false;

  // Accept both http and https to work in dev and prod
  return (
    origin === `https://${host}` ||
    origin === `http://${host}`
  );
}

function parseYCError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.message) return parsed.message;
  } catch {
    // not JSON
  }
  return body.trim() || "Unknown error";
}

async function exchangeOAuthForIAM(
  oauthToken: string
): Promise<{ iamToken: string; expiresAt: string }> {
  const res = await fetch(YC_IAM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yandexPassportOauthToken: oauthToken }),
  });

  if (!res.ok) {
    const body = await res.text();
    const message = parseYCError(body);
    log.error(`IAM exchange failed (${res.status}):`, message);
    throw new Error(message);
  }

  const data = await res.json();
  return { iamToken: data.iamToken, expiresAt: data.expiresAt };
}

// POST /api/auth/oauth — save OAuth token, exchange for IAM
export async function POST(request: NextRequest) {
  // CSRF check
  if (!isValidOrigin(request)) {
    log.warn("Auth POST rejected: invalid Origin header");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limiting
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    log.warn(`Auth POST rate limited for IP: ${ip}`);
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { token } = body;

    const tokenError = validateOAuthToken(token);
    if (tokenError) {
      return NextResponse.json({ error: tokenError }, { status: 400 });
    }

    // Exchange OAuth → IAM
    const { iamToken, expiresAt } = await exchangeOAuthForIAM(token);
    log.info("OAuth → IAM exchange successful");

    // Validate IAM token works
    const testRes = await fetch(
      "https://resource-manager.api.yandexcloud.kz/resource-manager/v1/clouds?pageSize=1",
      { headers: { Authorization: `Bearer ${iamToken}` } }
    );

    if (!testRes.ok) {
      const testBody = await testRes.text();
      const message = parseYCError(testBody);
      log.error(`Token validation failed (${testRes.status}):`, message);
      return NextResponse.json(
        { error: `Не удалось проверить токен: ${message}` },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });

    // OAuth token: 30 days (down from 1 year — user re-authenticates if idle)
    response.cookies.set(OAUTH_COOKIE, token, {
      ...COOKIE_OPTS,
      maxAge: 30 * 24 * 60 * 60,
    });

    // IAM token (lives ~12h, auto-refreshed from OAuth token)
    response.cookies.set(IAM_COOKIE, iamToken, {
      ...COOKIE_OPTS,
      maxAge: 12 * 60 * 60,
    });

    // IAM expiry timestamp (httpOnly — not readable by client JS)
    response.cookies.set(IAM_EXPIRES_COOKIE, expiresAt, {
      ...COOKIE_OPTS,
      maxAge: 12 * 60 * 60,
    });

    log.info("Authentication successful");
    return response;
  } catch (e) {
    const message = (e as Error).message;
    log.error("Auth POST error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// DELETE /api/auth/oauth — clear all tokens (logout)
export async function DELETE(request: NextRequest) {
  if (!isValidOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  log.info("Logout");
  const response = NextResponse.json({ ok: true });
  for (const name of [OAUTH_COOKIE, IAM_COOKIE, IAM_EXPIRES_COOKIE]) {
    response.cookies.set(name, "", { ...COOKIE_OPTS, maxAge: 0 });
  }
  return response;
}

// GET /api/auth/oauth — check if authenticated
export async function GET() {
  const cookieStore = await cookies();
  const oauthToken = cookieStore.get(OAUTH_COOKIE)?.value;
  const iamToken = cookieStore.get(IAM_COOKIE)?.value;
  return NextResponse.json({
    authenticated: !!oauthToken && !!iamToken,
  });
}
