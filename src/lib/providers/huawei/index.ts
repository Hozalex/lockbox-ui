import { log } from "@/lib/logger";
import type { Folder, KmsKey, Operation } from "@/lib/types";
import { ProviderApiError, type SecretsProvider } from "@/lib/providers/types";
import {
  CREATED_BY_TAG,
  CREATED_BY_VALUE,
  CSMS_DEFAULT_KEY_ALIAS,
  ENVIRONMENT_TAG,
  envMapGet,
  getHuaweiConfig,
} from "@/lib/providers/huawei/config";
import { hwRequest } from "@/lib/providers/huawei/client";
import {
  applyPayloadChanges,
  requirePlainText,
  currentVersionId,
  diffTags,
  environmentOf,
  ensureNamePrefix,
  HUAWEI_SECRET_NAME_RE,
  mapSecret,
  mapVersion,
  parsePayload,
  serializeEntries,
  userLabels,
  type HwSecretMeta,
  type HwVersionMeta,
  type Tag,
} from "@/lib/providers/huawei/mapping";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Built-in stages CSMS doesn't let us remove. */
const BUILTIN_STAGES = ["SYSCURRENT", "SYSPREVIOUS"];

const enc = encodeURIComponent;

function op(secretName: string, description = ""): Operation {
  return {
    id: "",
    description,
    createdAt: new Date().toISOString(),
    done: true,
    metadata: { secretId: secretName },
  };
}

function requireEnvironment(env: string): string {
  if (!getHuaweiConfig().environments.includes(env)) {
    throw new ProviderApiError(404, `Окружение «${env}» не найдено`);
  }
  return env;
}

/** Secrets outside the configured enterprise project are invisible to lbox. */
function inScope(enterpriseProjectId: string | undefined): boolean {
  const ep = getHuaweiConfig().enterpriseProjectId;
  return !ep || enterpriseProjectId === ep;
}

async function showSecret(name: string): Promise<HwSecretMeta> {
  const { secret } = await hwRequest<{ secret: HwSecretMeta }>({
    method: "GET",
    path: `/secrets/${enc(name)}`,
  });
  if (!secret || !inScope(secret.enterprise_project_id)) {
    throw new ProviderApiError(404, `Секрет «${name}» не найден`);
  }
  return secret;
}

async function secretTags(secretId: string): Promise<Tag[]> {
  const { tags } = await hwRequest<{ tags?: Tag[] }>({
    method: "GET",
    path: `/csms/${enc(secretId)}/tags`,
  });
  return tags ?? [];
}

async function batchTags(secretId: string, action: "create" | "delete", tags: Tag[]) {
  if (tags.length === 0) return;
  await hwRequest({
    method: "POST",
    path: `/csms/${enc(secretId)}/tags/action`,
    body: { action, tags },
  });
}

async function versionMetas(name: string): Promise<HwVersionMeta[]> {
  const r = await hwRequest<{ version_metadatas?: HwVersionMeta[] }>({
    method: "GET",
    path: `/secrets/${enc(name)}/versions`,
    query: { limit: "50" },
  });
  return r.version_metadatas ?? [];
}

async function readVersion(name: string, versionId: string) {
  const { version } = await hwRequest<{
    version: { secret_string?: string; secret_binary?: string };
  }>({ method: "GET", path: `/secrets/${enc(name)}/versions/${enc(versionId)}` });
  return version ?? {};
}

interface HwKmsKey {
  key_id: string;
  key_alias?: string;
  key_description?: string;
  key_state?: string;
  key_spec?: string;
}

async function listAllKmsKeys(): Promise<HwKmsKey[]> {
  const c = getHuaweiConfig();
  const out: HwKmsKey[] = [];
  let marker: string | undefined;
  for (let page = 0; page < 20; page++) {
    const r = await hwRequest<{ key_details?: HwKmsKey[]; next_marker?: string; truncated?: string }>({
      method: "POST",
      raw: true,
      path: `/v1.0/${c.projectId}/kms/list-keys`,
      body: { limit: "1000", ...(marker ? { marker } : {}) },
    });
    out.push(...(r.key_details ?? []));
    if (r.truncated !== "true" || !r.next_marker) break;
    marker = r.next_marker;
  }
  // key_state "2" = enabled
  return out.filter((k) => k.key_state === "2");
}

/** Default KMS key for new secrets in an environment (undefined = CSMS default). */
async function defaultKmsKeyId(env: string): Promise<string | undefined> {
  const alias = envMapGet(getHuaweiConfig().kmsDefaults, env);
  if (alias === CSMS_DEFAULT_KEY_ALIAS) return undefined;
  const key = (await listAllKmsKeys()).find((k) => k.key_alias === alias);
  if (!key) {
    // Never silently fall back to another key for an environment with its own key.
    throw new ProviderApiError(500, `KMS-ключ «${alias}» для окружения «${env}» не найден`);
  }
  return key.key_id;
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Secrets of one environment via the tag filter API — one call per page. */
async function listByTagFilter(env: string) {
  const secrets = [];
  for (let offset = 0; ; ) {
    const r = await hwRequest<{
      resources?: { resource_name: string; resource_detail?: HwSecretMeta; tags?: Tag[] }[];
      total_count?: number;
    }>({
      method: "POST",
      path: "/csms/resource_instances/action",
      body: {
        action: "filter",
        limit: "1000",
        offset: String(offset),
        tags: [{ key: ENVIRONMENT_TAG, values: [env] }],
      },
    });
    const page = r.resources ?? [];
    for (const res of page) {
      const detail = { ...(res.resource_detail ?? {}), name: res.resource_name } as HwSecretMeta;
      if (!inScope(detail.enterprise_project_id)) continue;
      secrets.push(mapSecret(detail, res.tags ?? []));
    }
    offset += page.length;
    if (page.length === 0 || offset >= (r.total_count ?? 0)) break;
  }
  return secrets;
}

/**
 * Fallback when the tag filter API is denied (csms:tag:getSecretByTag):
 * list all visible secrets, then read each one's tags (bounded concurrency).
 */
async function listByScan(env: string) {
  const all: HwSecretMeta[] = [];
  let marker: string | undefined;
  for (let page = 0; page < 50; page++) {
    const r = await hwRequest<{ secrets?: HwSecretMeta[]; page_info?: { next_marker?: string | null } }>({
      method: "GET",
      path: "/secrets",
      query: { limit: "200", marker },
    });
    all.push(...(r.secrets ?? []).filter((s) => inScope(s.enterprise_project_id)));
    marker = r.page_info?.next_marker ?? undefined;
    if (!marker) break;
  }
  const tagged = await mapLimit(all, 8, async (s) => ({ s, tags: await secretTags(s.id) }));
  return tagged.filter(({ tags }) => environmentOf(tags) === env).map(({ s, tags }) => mapSecret(s, tags));
}

/** When the tag filter was last denied; retried after a while in case it gets granted. */
let tagFilterDeniedAt = 0;
const TAG_FILTER_RETRY_MS = 10 * 60 * 1000;

const ID_RULES: Record<string, RegExp> = {
  secretId: HUAWEI_SECRET_NAME_RE,
  versionId: /^v[0-9]{1,10}$/,
  folderId: /^[a-z0-9_-]{1,63}$/,
  cloudId: /^[a-z0-9-]{1,64}$/,
};

/**
 * Huawei Cloud CSMS (Data Encryption Workshop).
 *
 * Mapping: cloud = region, folder = `environment` tag, secret id = secret name.
 * Secret values are JSON objects in secret_string. Deleting a secret schedules
 * it (7–30 days, restorable). "Deleting" a version sets its expire_time
 * (CSMS has no version delete); expired versions remain and show as EXPIRED.
 */
export const huaweiProvider: SecretsProvider = {
  id: "huawei",
  capabilities: {
    tokenLogin: false,
    multipleClouds: false,
    renameSecret: false,
    deletionProtection: false,
    versionDestruction: true,
    versionDestructionCancel: false,
    deferredSecretDeletion: true,
    keyCountInList: false,
    plainTextPayload: true,
  },

  uiPolicy() {
    const c = getHuaweiConfig();
    return {
      secretDeletionDays: c.secretDeletionDays,
      versionRetentionDays: c.versionRetentionDays,
      namePrefix: { exemptFolders: c.freeNamingEnvironments },
      systemLabels: [ENVIRONMENT_TAG, CREATED_BY_TAG],
    };
  },

  validateResourceId(id, label) {
    if (!id || typeof id !== "string") return `${label} is required`;
    const re = ID_RULES[label] ?? /^[A-Za-z0-9_.-]{1,128}$/;
    return re.test(id) ? null : `Некорректный формат ${label}`;
  },

  // ---- Scopes ----

  async listClouds() {
    const { region } = getHuaweiConfig();
    return { clouds: [{ id: region, name: region, description: "Huawei Cloud", createdAt: "" }] };
  },

  async listFolders() {
    const { region, environments } = getHuaweiConfig();
    const folders: Folder[] = environments.map((env) => ({
      id: env,
      cloudId: region,
      name: env,
      description: "",
      createdAt: "",
      status: "ACTIVE",
    }));
    return { folders };
  },

  async getFolder(folderId) {
    const { region } = getHuaweiConfig();
    const env = requireEnvironment(folderId);
    return { id: env, cloudId: region, name: env, description: "", createdAt: "", status: "ACTIVE" };
  },

  // ---- Secrets ----

  async listSecrets(folderId) {
    const env = requireEnvironment(folderId);
    if (Date.now() - tagFilterDeniedAt > TAG_FILTER_RETRY_MS) {
      try {
        return { secrets: await listByTagFilter(env) };
      } catch (e) {
        if ((e as ProviderApiError).status !== 403) throw e;
        tagFilterDeniedAt = Date.now();
        log.warn(
          "CSMS tag filter denied (csms:tag:getSecretByTag) — listing secrets one by one; grant it for single-call listing"
        );
      }
    }
    return { secrets: await listByScan(env) };
  },

  async getSecret(name) {
    const secret = await showSecret(name);
    const tags = await secretTags(secret.id);
    let current;
    try {
      const metas = await versionMetas(name);
      const id = currentVersionId(metas);
      const meta = metas.find((v) => v.id === id);
      if (meta) current = mapVersion(name, meta);
    } catch (e) {
      // A secret pending deletion can't be inspected — show it without versions.
      if (secret.state !== "PENDING_DELETE") throw e;
    }
    return mapSecret(secret, tags, current);
  },

  async createSecret(body) {
    const c = getHuaweiConfig();
    const env = requireEnvironment(body.folderId);
    const labels = userLabels(body.labels); // environment can't be set by the user
    const name = ensureNamePrefix(
      body.name,
      env,
      labels.project,
      !c.freeNamingEnvironments.includes(env)
    );
    const kmsKeyId = body.kmsKeyId || (await defaultKmsKeyId(env));

    const { secret } = await hwRequest<{ secret: HwSecretMeta }>({
      method: "POST",
      path: "/secrets",
      body: {
        name,
        description: body.description || undefined,
        kms_key_id: kmsKeyId,
        secret_string:
          body.versionPlainText !== undefined
            ? requirePlainText(body.versionPlainText)
            : serializeEntries(body.versionPayloadEntries ?? []),
        enterprise_project_id: c.enterpriseProjectId,
      },
    });

    const tags: Tag[] = [
      { key: ENVIRONMENT_TAG, value: env },
      { key: CREATED_BY_TAG, value: CREATED_BY_VALUE },
      ...Object.entries(labels).map(([key, value]) => ({ key, value })),
    ];
    try {
      await batchTags(secret.id, "create", tags);
    } catch (e) {
      // Without its environment tag the secret would be invisible in lbox —
      // remove it rather than leave an orphan.
      log.error(`Tagging ${name} failed, deleting the new secret:`, (e as Error).message);
      await hwRequest({ method: "DELETE", path: `/secrets/${enc(name)}` }).catch((err) =>
        log.error(`Rollback delete of ${name} failed:`, (err as Error).message)
      );
      throw new ProviderApiError(
        (e as ProviderApiError).status || 500,
        `Не удалось проставить теги, секрет не создан: ${(e as Error).message}`
      );
    }
    return op(name);
  },

  async updateSecret(name, body) {
    const mask = (body.updateMask || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (mask.includes("name") && body.name && body.name !== name) {
      throw new ProviderApiError(400, "Переименование секретов в Huawei CSMS не поддерживается");
    }
    if (mask.includes("deletionProtection") && body.deletionProtection) {
      throw new ProviderApiError(400, "Защита от удаления в Huawei CSMS не поддерживается");
    }
    const secret = await showSecret(name);
    if (mask.includes("description")) {
      await hwRequest({
        method: "PUT",
        path: `/secrets/${enc(name)}`,
        body: { description: body.description ?? "" },
      });
    }
    if (mask.includes("labels")) {
      const { remove, add } = diffTags(await secretTags(secret.id), body.labels ?? {});
      await batchTags(secret.id, "delete", remove);
      await batchTags(secret.id, "create", add);
    }
    return op(name);
  },

  async deleteSecret(name) {
    const secret = await showSecret(name);
    const env = environmentOf(await secretTags(secret.id)) ?? "";
    const days = envMapGet(getHuaweiConfig().secretDeletionDays, env);
    await hwRequest({
      method: "POST",
      path: `/secrets/${enc(name)}/scheduled-deleted-tasks/create`,
      body: { recovery_window_in_days: days },
    });
    return op(name, `Секрет будет удалён через ${days} дн.`);
  },

  async restoreSecret(name) {
    await showSecret(name);
    await hwRequest({ method: "POST", path: `/secrets/${enc(name)}/scheduled-deleted-tasks/cancel` });
    return op(name, "Удаление отменено");
  },

  // ---- Payload & versions ----

  async getPayload(name, versionId) {
    await showSecret(name);
    const id = versionId ?? currentVersionId(await versionMetas(name));
    if (!id) throw new ProviderApiError(404, `У секрета «${name}» нет текущей версии`);
    const parsed = parsePayload(await readVersion(name, id));
    return {
      versionId: id,
      entries: parsed.entries,
      ...(parsed.format === "plain" ? { plainText: parsed.entries[0]?.textValue ?? "" } : {}),
    };
  },

  async listVersions(name) {
    await showSecret(name);
    const metas = await versionMetas(name);
    const versions = metas
      .map((v) => mapVersion(name, v))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { versions };
  },

  async addVersion(name, body) {
    await showSecret(name);
    const currentId = currentVersionId(await versionMetas(name));
    if (body.baseVersionId && currentId && body.baseVersionId !== currentId) {
      throw new ProviderApiError(409, "Секрет был изменён другим пользователем — обновите страницу");
    }
    let secretString: string;
    if (body.plainText !== undefined) {
      secretString = requirePlainText(body.plainText);
    } else {
      const current = currentId
        ? parsePayload(await readVersion(name, currentId))
        : { format: "json" as const, entries: [] };
      secretString = applyPayloadChanges(current, body.payloadEntries ?? []);
    }
    await hwRequest({
      method: "POST",
      path: `/secrets/${enc(name)}/versions`,
      body: { secret_string: secretString },
    });
    return op(name);
  },

  async scheduleVersionDestruction(name, body) {
    const secret = await showSecret(name);
    const v = (await versionMetas(name)).find((m) => m.id === body.versionId);
    if (!v) throw new ProviderApiError(404, `Версия ${body.versionId} не найдена`);
    if (v.version_stages?.includes("SYSCURRENT")) {
      throw new ProviderApiError(400, "Нельзя удалить текущую версию — сначала сделайте текущей другую");
    }
    // Drop custom stages so the version is no longer referenced (built-ins can't be removed).
    for (const stage of v.version_stages ?? []) {
      if (BUILTIN_STAGES.includes(stage)) continue;
      await hwRequest({ method: "DELETE", path: `/secrets/${enc(name)}/stages/${enc(stage)}` });
    }
    const env = environmentOf(await secretTags(secret.id)) ?? "";
    const days = envMapGet(getHuaweiConfig().versionRetentionDays, env);
    await hwRequest({
      method: "PUT",
      path: `/secrets/${enc(name)}/versions/${enc(v.id)}`,
      body: { expire_time: Date.now() + days * DAY_MS },
    });
    return op(name, `Версия ${v.id} истечёт через ${days} дн.`);
  },

  async cancelVersionDestruction() {
    throw new ProviderApiError(
      400,
      "Отменить удаление версии в Huawei CSMS нельзя: срок действия можно только продлить"
    );
  },

  // ---- KMS ----

  async listKmsKeys(folderId) {
    const env = requireEnvironment(folderId);
    const defaultAlias = envMapGet(getHuaweiConfig().kmsDefaults, env);
    const keys: KmsKey[] = (await listAllKmsKeys()).map((k) => ({
      id: k.key_id,
      name: k.key_alias ?? k.key_id,
      description: k.key_description ?? "",
      status: "ENABLED",
      defaultAlgorithm: k.key_spec ?? "",
      isDefault: k.key_alias === defaultAlias,
    }));
    return { keys };
  },
};
