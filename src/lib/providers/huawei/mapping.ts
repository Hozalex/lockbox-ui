/**
 * Pure mapping between Huawei CSMS shapes and our domain types. No I/O here,
 * so all of it is unit-tested.
 */
import type { PayloadEntry, PayloadEntryChange, Secret, SecretVersion } from "@/lib/types";
import { ProviderApiError } from "@/lib/providers/types";
import { CREATED_BY_TAG, ENVIRONMENT_TAG } from "@/lib/providers/huawei/config";

// ---- Payload ----------------------------------------------------------------

/**
 * A CSMS secret holds ONE string (or binary). lbox stores key/value pairs as a
 * JSON object in secret_string — the same convention the Huawei console uses.
 * Secrets created elsewhere may hold a plain string; we keep them plain.
 */
export type PayloadFormat = "json" | "plain" | "binary";

/** Key under which a non-JSON secret_string is shown. */
export const PLAIN_KEY = "value";
/** Key under which a binary secret is shown. */
export const BINARY_KEY = "binary";

export interface ParsedPayload {
  format: PayloadFormat;
  entries: PayloadEntry[];
}

export function parsePayload(v: { secret_string?: string; secret_binary?: string }): ParsedPayload {
  if (v.secret_binary !== undefined && v.secret_string === undefined) {
    return { format: "binary", entries: [{ key: BINARY_KEY, binaryValue: v.secret_binary }] };
  }
  const raw = v.secret_string ?? "";
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return {
        format: "json",
        entries: Object.entries(obj as Record<string, unknown>).map(([key, val]) => ({
          key,
          textValue: typeof val === "string" ? val : JSON.stringify(val),
        })),
      };
    }
  } catch {
    // not JSON — plain string
  }
  return { format: "plain", entries: [{ key: PLAIN_KEY, textValue: raw }] };
}

/** Build the secret_string for a new version from entries. */
export function serializeEntries(entries: { key: string; textValue?: string }[]): string {
  return JSON.stringify(Object.fromEntries(entries.map((e) => [e.key, e.textValue ?? ""])));
}

/** Validates a plain-text payload (CSMS rejects empty values). */
export function requirePlainText(text: unknown): string {
  if (typeof text !== "string" || text.length === 0) {
    throw new ProviderApiError(400, "Текст секрета не может быть пустым");
  }
  return text;
}

/**
 * Apply YC-style changes to the current payload and return the new
 * secret_string. A change with a value sets the key; a key-only change deletes
 * it. A plain secret stays plain while its only key is "value".
 */
export function applyPayloadChanges(current: ParsedPayload, changes: PayloadEntryChange[]): string {
  if (current.format === "binary") {
    throw new ProviderApiError(400, "Бинарные секреты редактируются в консоли Huawei");
  }
  const map = new Map(current.entries.map((e) => [e.key, e.textValue ?? ""]));
  for (const ch of changes) {
    if (ch.binaryValue !== undefined) {
      throw new ProviderApiError(400, "Бинарные значения не поддерживаются");
    }
    if (ch.textValue === undefined) map.delete(ch.key);
    else map.set(ch.key, ch.textValue);
  }
  if (map.size === 0) throw new ProviderApiError(400, "Секрет не может быть пустым");
  if (current.format === "plain" && map.size === 1 && map.has(PLAIN_KEY)) {
    return map.get(PLAIN_KEY)!;
  }
  return JSON.stringify(Object.fromEntries(map));
}

// ---- Tags / labels ------------------------------------------------------------

export interface Tag {
  key: string;
  value: string;
}

/** Tags the UI must never set or change directly. */
export const SYSTEM_TAGS = [ENVIRONMENT_TAG, CREATED_BY_TAG];

/** Labels shown to the UI: every tag except the environment (that's the folder). */
export function labelsFromTags(tags: Tag[]): Record<string, string> {
  return Object.fromEntries(
    tags.filter((t) => t.key !== ENVIRONMENT_TAG).map((t) => [t.key, t.value ?? ""])
  );
}

export function environmentOf(tags: Tag[]): string | undefined {
  return tags.find((t) => t.key === ENVIRONMENT_TAG)?.value || undefined;
}

/** User-supplied labels with system tags removed (environment comes from the folder). */
export function userLabels(labels: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(labels ?? {}).filter(([k]) => !SYSTEM_TAGS.includes(k.trim()))
  );
}

/**
 * Tag changes needed to go from `current` to the user's desired labels, never
 * touching system tags. A changed value is a delete + create, since CSMS
 * doesn't document whether create overwrites.
 */
export function diffTags(
  current: Tag[],
  desiredLabels: Record<string, string>
): { remove: Tag[]; add: Tag[] } {
  const desired = userLabels(desiredLabels);
  const cur = current.filter((t) => !SYSTEM_TAGS.includes(t.key));
  const remove = cur.filter((t) => !(t.key in desired) || desired[t.key] !== t.value);
  const add = Object.entries(desired)
    .filter(([k, v]) => !cur.some((t) => t.key === k && t.value === v))
    .map(([key, value]) => ({ key, value }));
  return { remove, add };
}

// ---- Names ----------------------------------------------------------------------

export const HUAWEI_SECRET_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Naming convention: "<env>-<project>-..." (or "<env>-..." without a project). */
export function namePrefix(env: string, project?: string): string {
  return project ? `${env}-${project}-` : `${env}-`;
}

/**
 * Applies the naming convention (unless `enforcePrefix` is false, for
 * environments with free-form names) and validates the result for CSMS.
 */
export function ensureNamePrefix(
  name: string,
  env: string,
  project?: string,
  enforcePrefix = true
): string {
  const prefix = namePrefix(env, project);
  const full = !enforcePrefix || name.startsWith(prefix) ? name : prefix + name;
  if (!HUAWEI_SECRET_NAME_RE.test(full)) {
    throw new ProviderApiError(
      400,
      `Некорректное имя «${full}»: латиница, цифры, _ и -, до 64 символов`
    );
  }
  return full;
}

// ---- Secrets & versions -----------------------------------------------------------

const ms = (v: number | string | undefined) =>
  v === undefined || v === null || v === "" ? undefined : new Date(Number(v)).toISOString();

export function secretStatus(state: string | undefined): Secret["status"] {
  switch (state) {
    case "ENABLED":
      return "ACTIVE";
    case "PENDING_DELETE":
      return "PENDING_DELETION";
    default:
      return "INACTIVE";
  }
}

export interface HwVersionMeta {
  id: string;
  version_stages?: string[];
  create_time?: number;
  expire_time?: number;
  kms_key_id?: string;
}

/**
 * A version with an expire_time in the future is "scheduled for destruction";
 * one past it is EXPIRED (CSMS keeps it — it only fires an event).
 */
export function mapVersion(secretName: string, v: HwVersionMeta, now = Date.now()): SecretVersion {
  const expire = v.expire_time ? Number(v.expire_time) : undefined;
  const status: SecretVersion["status"] =
    expire === undefined ? "ACTIVE" : expire <= now ? "EXPIRED" : "SCHEDULED_FOR_DESTRUCTION";
  return {
    id: v.id,
    secretId: secretName,
    createdAt: ms(v.create_time) ?? "",
    destroyAt: ms(expire),
    description: "",
    status,
    payloadEntryKeys: [],
    stages: v.version_stages ?? [],
  };
}

export function currentVersionId(versions: HwVersionMeta[]): string | undefined {
  return versions.find((v) => v.version_stages?.includes("SYSCURRENT"))?.id;
}

export interface HwSecretMeta {
  id: string;
  name: string;
  state?: string;
  description?: string;
  kms_key_id?: string;
  create_time?: number;
  scheduled_delete_time?: number;
  enterprise_project_id?: string;
}

export function mapSecret(
  s: HwSecretMeta,
  tags: Tag[],
  current?: SecretVersion
): Secret {
  return {
    id: s.name, // CSMS addresses secrets by name
    folderId: environmentOf(tags) ?? "",
    createdAt: ms(s.create_time) ?? "",
    name: s.name,
    description: s.description ?? "",
    labels: labelsFromTags(tags),
    kmsKeyId: s.kms_key_id,
    status: secretStatus(s.state),
    currentVersion:
      current ??
      ({
        id: "",
        secretId: s.name,
        createdAt: "",
        description: "",
        status: "ACTIVE",
        payloadEntryKeys: [],
      } as SecretVersion),
    deletionProtection: false,
    deletionScheduledAt: ms(s.scheduled_delete_time),
  };
}
