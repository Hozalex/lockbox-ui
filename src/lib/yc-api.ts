import { getIamToken } from "@/lib/auth";
import { log } from "@/lib/logger";

const LOCKBOX_API = "https://cpl.lockbox.api.yandexcloud.kz/lockbox/v1";
const PAYLOAD_API =
  "https://dpl.lockbox.api.yandexcloud.kz/lockbox/v1";
const RESOURCE_MANAGER_API =
  "https://resource-manager.api.yandexcloud.kz/resource-manager/v1";
const KMS_API = "https://cpl.kms.api.yandexcloud.kz/kms/v1";

export class YCApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "YCApiError";
  }
}

async function requireIamToken(): Promise<string> {
  const token = await getIamToken();
  if (!token) {
    throw new YCApiError(401, "Not authenticated");
  }
  return token;
}

// Parse YC API error body into a human-readable message
function parseYCError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.message) return parsed.message;
  } catch {
    // not JSON
  }
  if (!body.trim()) return `HTTP ${status}`;
  return body;
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const iamToken = await requireIamToken();
  const method = options.method || "GET";
  const url = `${baseUrl}${path}`;

  log.debug(`${method} ${url}`);

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${iamToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    // YC KZ API returns 404 with empty body for empty lists
    if (res.status === 404 && !body.trim()) {
      log.debug(`${method} ${url} → 404 (empty, treating as empty list)`);
      return {} as T;
    }
    const message = parseYCError(res.status, body);
    log.error(`${method} ${url} → ${res.status}:`, message);
    throw new YCApiError(res.status, message);
  }

  const text = await res.text();
  if (!text.trim()) {
    log.debug(`${method} ${url} → ${res.status} (empty body)`);
    return {} as T;
  }
  log.debug(`${method} ${url} → ${res.status}`);
  return JSON.parse(text);
}

// Resource Manager
export function listClouds(pageSize = 100, pageToken?: string) {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set("pageToken", pageToken);
  return request<{ clouds: Array<{ id: string; name: string; description: string; createdAt: string }>; nextPageToken?: string }>(
    RESOURCE_MANAGER_API,
    `/clouds?${params}`
  );
}

export function listFolders(
  cloudId: string,
  pageSize = 100,
  pageToken?: string
) {
  const params = new URLSearchParams({
    cloudId,
    pageSize: String(pageSize),
  });
  if (pageToken) params.set("pageToken", pageToken);
  return request<{ folders: Array<{ id: string; cloudId: string; name: string; description: string; createdAt: string; status: string }>; nextPageToken?: string }>(
    RESOURCE_MANAGER_API,
    `/folders?${params}`
  );
}

// Lockbox Secrets
export function listSecrets(
  folderId: string,
  pageSize = 100,
  pageToken?: string
) {
  const params = new URLSearchParams({
    folderId,
    pageSize: String(pageSize),
  });
  if (pageToken) params.set("pageToken", pageToken);
  return request<{ secrets: import("./types").Secret[]; nextPageToken?: string }>(
    LOCKBOX_API,
    `/secrets?${params}`
  );
}

export function getSecret(secretId: string) {
  return request<import("./types").Secret>(
    LOCKBOX_API,
    `/secrets/${secretId}`
  );
}

export function createSecret(body: import("./types").CreateSecretRequest) {
  return request<import("./types").Operation>(LOCKBOX_API, "/secrets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateSecret(
  secretId: string,
  body: import("./types").UpdateSecretRequest
) {
  return request<import("./types").Operation>(
    LOCKBOX_API,
    `/secrets/${secretId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

export function deleteSecret(secretId: string) {
  return request<import("./types").Operation>(
    LOCKBOX_API,
    `/secrets/${secretId}`,
    { method: "DELETE" }
  );
}

// Payload
export function getPayload(secretId: string, versionId?: string) {
  const params = versionId
    ? `?versionId=${encodeURIComponent(versionId)}`
    : "";
  return request<import("./types").Payload>(
    PAYLOAD_API,
    `/secrets/${secretId}/payload${params}`
  );
}

// Versions
export function listVersions(
  secretId: string,
  pageSize = 100,
  pageToken?: string
) {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set("pageToken", pageToken);
  return request<{ versions: import("./types").SecretVersion[]; nextPageToken?: string }>(
    LOCKBOX_API,
    `/secrets/${secretId}/versions?${params}`
  );
}

export function addVersion(
  secretId: string,
  body: import("./types").AddVersionRequest
) {
  return request<import("./types").Operation>(
    LOCKBOX_API,
    `/secrets/${secretId}:addVersion`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export function scheduleVersionDestruction(
  secretId: string,
  body: import("./types").ScheduleVersionDestructionRequest
) {
  return request<import("./types").Operation>(
    LOCKBOX_API,
    `/secrets/${secretId}:scheduleVersionDestruction`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export function cancelVersionDestruction(
  secretId: string,
  versionId: string
) {
  return request<import("./types").Operation>(
    LOCKBOX_API,
    `/secrets/${secretId}:cancelVersionDestruction`,
    {
      method: "POST",
      body: JSON.stringify({ versionId }),
    }
  );
}

// KMS
export function listKmsKeys(
  folderId: string,
  pageSize = 100,
  pageToken?: string
) {
  const params = new URLSearchParams({
    folderId,
    pageSize: String(pageSize),
  });
  if (pageToken) params.set("pageToken", pageToken);
  return request<{
    keys: Array<{
      id: string;
      name: string;
      description: string;
      status: string;
      defaultAlgorithm: string;
    }>;
    nextPageToken?: string;
  }>(KMS_API, `/keys?${params}`);
}
