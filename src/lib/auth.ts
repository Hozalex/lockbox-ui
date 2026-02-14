import { cookies } from "next/headers";
import { log } from "@/lib/logger";

const OAUTH_COOKIE = "oauth_token";
const IAM_COOKIE = "iam_token";
const IAM_EXPIRES_COOKIE = "iam_expires_at";
const YC_IAM_ENDPOINT = "https://iam.api.yandexcloud.kz/iam/v1/tokens";

// Buffer: refresh IAM token 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getIamToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const iamToken = cookieStore.get(IAM_COOKIE)?.value;
  const expiresAt = cookieStore.get(IAM_EXPIRES_COOKIE)?.value;
  const oauthToken = cookieStore.get(OAUTH_COOKIE)?.value;

  // If IAM token is still valid, return it
  if (iamToken && expiresAt) {
    const expiresMs = new Date(expiresAt).getTime();
    if (Date.now() < expiresMs - REFRESH_BUFFER_MS) {
      return iamToken;
    }
  }

  // IAM expired or missing — try to refresh using OAuth token
  if (oauthToken) {
    try {
      const res = await fetch(YC_IAM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yandexPassportOauthToken: oauthToken }),
      });

      if (res.ok) {
        const data = await res.json();
        log.info("IAM token refreshed via OAuth");
        // Note: we can't set cookies in a read context (server components / API route handlers
        // that already started streaming). The new IAM token will be used for this request only.
        // The next request through /api/auth GET will detect expiry and the client will re-auth.
        return data.iamToken as string;
      }
      log.warn("IAM token refresh failed:", res.status);
    } catch (e) {
      log.error("IAM token refresh error:", e);
    }
  }

  return iamToken || null;
}
