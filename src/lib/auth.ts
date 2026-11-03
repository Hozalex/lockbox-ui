import { createSign } from "crypto";
import { log } from "@/lib/logger";

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

/** YC calls use only the server-side service account. */
export async function getIamToken(): Promise<string | null> {
  return getSaIamToken();
}
