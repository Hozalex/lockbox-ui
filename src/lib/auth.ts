import { cookies } from "next/headers";
import { createSign } from "crypto";
import { log } from "@/lib/logger";

export const OAUTH_COOKIE = "oauth_token";
export const IAM_COOKIE = "iam_token";
export const IAM_EXPIRES_COOKIE = "iam_expires_at";
export const YC_IAM_ENDPOINT = "https://iam.api.yandexcloud.kz/iam/v1/tokens";

// Buffer: refresh IAM token 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ---- Service Account IAM token via Authorized Key (for Keycloak mode) ----

interface SAAuthorizedKey {
  id: string;
  service_account_id: string;
  private_key: string;
}

let parsedSAKey: SAAuthorizedKey | null = null;

function getSAKey(): SAAuthorizedKey | null {
  if (parsedSAKey) return parsedSAKey;

  const raw = process.env.YC_SA_AUTHORIZED_KEY_JSON;
  if (!raw) return null;

  try {
    // Support both raw JSON and base64-encoded JSON
    let json: string;
    try {
      JSON.parse(raw);
      json = raw;
    } catch {
      json = Buffer.from(raw, "base64").toString("utf-8");
    }
    parsedSAKey = JSON.parse(json) as SAAuthorizedKey;
    return parsedSAKey;
  } catch (e) {
    log.error("Failed to parse YC_SA_AUTHORIZED_KEY_JSON:", e);
    return null;
  }
}

function base64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

/**
 * Build a signed JWT for YC IAM token exchange using the SA authorized key.
 * YC requires PS256 (RSASSA-PSS with SHA-256).
 */
function buildSAJwt(key: SAAuthorizedKey): string {
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(
    JSON.stringify({ alg: "PS256", typ: "JWT", kid: key.id })
  );

  const payload = base64url(
    JSON.stringify({
      iss: key.service_account_id,
      aud: YC_IAM_ENDPOINT,
      iat: now,
      exp: now + 3600,
    })
  );

  const signable = `${header}.${payload}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signable);
  const signature = sign.sign(
    { key: key.private_key, padding: 6 /* RSA_PKCS1_PSS_PADDING */, saltLength: 32 },
    "base64url"
  );

  return `${signable}.${signature}`;
}

let saIamToken: string | null = null;
let saIamExpiresAt = 0;

async function getSaIamToken(): Promise<string | null> {
  const saKey = getSAKey();
  if (!saKey) return null;

  // Return cached token if still valid
  if (saIamToken && Date.now() < saIamExpiresAt - REFRESH_BUFFER_MS) {
    return saIamToken;
  }

  try {
    const jwt = buildSAJwt(saKey);

    const res = await fetch(YC_IAM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jwt }),
    });

    if (!res.ok) {
      const body = await res.text();
      log.error("SA IAM token exchange failed:", res.status, body);
      return saIamToken; // return stale token if available
    }

    const data = await res.json();
    saIamToken = data.iamToken;
    saIamExpiresAt = new Date(data.expiresAt).getTime();
    log.info("SA IAM token refreshed via authorized key");
    return saIamToken;
  } catch (e) {
    log.error("SA IAM token refresh error:", e);
    return saIamToken; // return stale token if available
  }
}

// ---- Auth mode detection ----

export type AuthMode = "oauth" | "keycloak";

/**
 * Determine current auth mode.
 * If the request has an OAuth cookie, use OAuth mode.
 * Otherwise, if Keycloak is configured, use Keycloak mode.
 */
export async function getAuthMode(): Promise<AuthMode | null> {
  const cookieStore = await cookies();
  const oauthToken = cookieStore.get(OAUTH_COOKIE)?.value;

  if (oauthToken) return "oauth";
  if (process.env.KEYCLOAK_ISSUER) return "keycloak";
  return null;
}

// ---- IAM token retrieval ----

/**
 * Get an IAM token for YC API calls.
 * - OAuth mode: from user's OAuth token (cookie-based)
 * - Keycloak mode: from service account authorized key
 */
export async function getIamToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const oauthToken = cookieStore.get(OAUTH_COOKIE)?.value;

  // If user has an OAuth cookie, use the OAuth flow
  if (oauthToken) {
    return getOAuthIamToken(cookieStore, oauthToken);
  }

  // Otherwise, try service account (Keycloak mode)
  return getSaIamToken();
}

async function getOAuthIamToken(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  oauthToken: string
): Promise<string | null> {
  const iamToken = cookieStore.get(IAM_COOKIE)?.value;
  const expiresAt = cookieStore.get(IAM_EXPIRES_COOKIE)?.value;

  // If IAM token is still valid, return it
  if (iamToken && expiresAt) {
    const expiresMs = new Date(expiresAt).getTime();
    if (Date.now() < expiresMs - REFRESH_BUFFER_MS) {
      return iamToken;
    }
  }

  // IAM expired or missing — try to refresh using OAuth token
  try {
    const res = await fetch(YC_IAM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yandexPassportOauthToken: oauthToken }),
    });

    if (res.ok) {
      const data = await res.json();
      log.info("IAM token refreshed via OAuth");
      return data.iamToken as string;
    }
    log.warn("IAM token refresh failed:", res.status);
  } catch (e) {
    log.error("IAM token refresh error:", e);
  }

  return iamToken || null;
}

/**
 * Check if Keycloak auth is enabled (KEYCLOAK_ISSUER env var is set).
 */
export function isKeycloakEnabled(): boolean {
  return !!process.env.KEYCLOAK_ISSUER;
}
