import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const OAUTH_COOKIE = "oauth_token";
const IAM_COOKIE = "iam_token";
const IAM_EXPIRES_COOKIE = "iam_expires_at";
const YC_IAM_ENDPOINT = "https://iam.api.yandexcloud.kz/iam/v1/tokens";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

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
    throw new Error(`IAM exchange failed: ${body}`);
  }

  const data = await res.json();
  return { iamToken: data.iamToken, expiresAt: data.expiresAt };
}

// POST /api/auth — save OAuth token, exchange for IAM
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "token is required" },
        { status: 400 }
      );
    }

    // Exchange OAuth → IAM
    const { iamToken, expiresAt } = await exchangeOAuthForIAM(token);

    // Validate IAM token works
    const testRes = await fetch(
      "https://resource-manager.api.yandexcloud.kz/resource-manager/v1/clouds?pageSize=1",
      { headers: { Authorization: `Bearer ${iamToken}` } }
    );

    if (!testRes.ok) {
      const body = await testRes.text();
      return NextResponse.json(
        { error: `Token validation failed: ${body}` },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });

    // Store OAuth token (lives ~1 year)
    response.cookies.set(OAUTH_COOKIE, token, {
      ...COOKIE_OPTS,
      maxAge: 365 * 24 * 60 * 60,
    });

    // Store IAM token (lives ~12h)
    response.cookies.set(IAM_COOKIE, iamToken, {
      ...COOKIE_OPTS,
      maxAge: 12 * 60 * 60,
    });

    // Store expiration timestamp
    response.cookies.set(IAM_EXPIRES_COOKIE, expiresAt, {
      ...COOKIE_OPTS,
      maxAge: 12 * 60 * 60,
    });

    return response;
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/auth — clear all tokens (logout)
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  for (const name of [OAUTH_COOKIE, IAM_COOKIE, IAM_EXPIRES_COOKIE]) {
    response.cookies.set(name, "", { ...COOKIE_OPTS, maxAge: 0 });
  }
  return response;
}

// GET /api/auth — check if authenticated
export async function GET() {
  const cookieStore = await cookies();
  const oauthToken = cookieStore.get(OAUTH_COOKIE)?.value;
  const iamToken = cookieStore.get(IAM_COOKIE)?.value;
  return NextResponse.json({
    authenticated: !!oauthToken && !!iamToken,
  });
}
