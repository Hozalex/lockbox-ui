import { log } from "@/lib/logger";
import { ProviderApiError } from "@/lib/providers/types";
import { getHuaweiConfig, type HuaweiConfig } from "@/lib/providers/huawei/config";
import { signRequest } from "@/lib/providers/huawei/signer";

const TIMEOUT_MS = 15_000;
/** Refresh federated tokens this long before they expire. */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const csmsBase = (c: HuaweiConfig) =>
  `https://kms.${c.region}.myhuaweicloud.com`;
const iamBase = (c: HuaweiConfig) => `https://iam.${c.region}.myhuaweicloud.com`;

// ---- OIDC federation: Keycloak id_token -> Huawei project-scoped token ----

let federated: { token: string; expiresAt: number } | null = null;

async function keycloakIdToken(
  auth: Extract<HuaweiConfig["auth"], { mode: "oidc" }>
): Promise<string> {
  const res = await fetch(`${auth.issuer.replace(/\/$/, "")}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      scope: "openid",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new ProviderApiError(502, `Keycloak token request failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) {
    throw new ProviderApiError(
      502,
      "Keycloak did not return an id_token for client credentials (request scope=openid on a client that issues ID tokens)"
    );
  }
  return data.id_token;
}

async function federatedToken(c: HuaweiConfig): Promise<string> {
  if (federated && Date.now() < federated.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return federated.token;
  }
  if (c.auth.mode !== "oidc") throw new Error("federatedToken requires oidc auth");
  const idToken = await keycloakIdToken(c.auth);
  const res = await fetch(`${iamBase(c)}/v3.0/OS-AUTH/id-token/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Idp-Id": c.auth.idpId },
    body: JSON.stringify({
      auth: { id_token: { id: idToken }, scope: { project: { id: c.projectId } } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const token = res.headers.get("X-Subject-Token");
  if (!res.ok || !token) {
    throw new ProviderApiError(502, `Huawei IAM token exchange failed: HTTP ${res.status}`);
  }
  const body = (await res.json().catch(() => ({}))) as { token?: { expires_at?: string } };
  const expiresAt = Date.parse(body.token?.expires_at ?? "") || Date.now() + 60 * 60 * 1000;
  federated = { token, expiresAt };
  log.info("Huawei federated token refreshed");
  return token;
}

async function authHeaders(
  c: HuaweiConfig,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<Record<string, string>> {
  if (c.auth.mode === "aksk") {
    return signRequest({
      method,
      url,
      headers,
      body,
      accessKey: c.auth.accessKey,
      secretKey: c.auth.secretKey,
    });
  }
  return { ...headers, "X-Auth-Token": await federatedToken(c) };
}

// ---- Requests ----

/** Huawei error bodies look like { error_code, error_msg } (sometimes nested under "error"). */
function errorMessage(status: number, text: string): string {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const e = (j.error as Record<string, unknown>) ?? j;
    const msg = (e.error_msg ?? e.message) as string | undefined;
    const code = (e.error_code ?? e.code) as string | undefined;
    if (msg) return code ? `${msg} (${code})` : msg;
  } catch {
    // not JSON
  }
  return text.trim() || `HTTP ${status}`;
}

export interface HuaweiRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path after /v1/{project_id} (or a full path starting with /v1.0 when `raw`). */
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Use `path` verbatim instead of prefixing /v1/{project_id}. */
  raw?: boolean;
}

export async function hwRequest<T>(req: HuaweiRequest): Promise<T> {
  const c = getHuaweiConfig();
  const path = req.raw ? req.path : `/v1/${c.projectId}${req.path}`;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) qs.set(k, v);
  const url = `${csmsBase(c)}${path}${qs.size ? `?${qs}` : ""}`;
  const body = req.body === undefined ? undefined : JSON.stringify(req.body);

  const baseHeaders: Record<string, string> = { "X-Project-Id": c.projectId };
  if (body !== undefined) baseHeaders["Content-Type"] = "application/json";
  const headers = await authHeaders(c, req.method, url, baseHeaders, body);

  log.debug(`${req.method} ${path}`);
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ProviderApiError(504, `Huawei CSMS unreachable: ${(e as Error).message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    const message = errorMessage(res.status, text);
    log.error(`${req.method} ${path} → ${res.status}:`, message);
    throw new ProviderApiError(res.status, message);
  }
  log.debug(`${req.method} ${path} → ${res.status}`);
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderApiError(502, `Huawei returned invalid JSON for ${req.method} ${path}`);
  }
}

/** For tests: drop the cached federated token. */
export function _resetHuaweiTokenCache() {
  federated = null;
}
