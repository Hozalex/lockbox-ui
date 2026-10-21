/**
 * Huawei Cloud CSMS (DEW) configuration, read from env. Server-only.
 *
 * Model: all secrets live in one region project (optionally one enterprise
 * project). Our "folder" is the value of the secret's `environment` tag
 * (dev / stage / prod / infra), our project is the `project` tag.
 */

import { envMapGet, parseEnvMap, type EnvMap } from "@/lib/env-map";

export { envMapGet, parseEnvMap, type EnvMap };

export type HuaweiAuthMode = "aksk" | "oidc";

function list(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function int(v: string): number {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Expected an integer, got "${v}"`);
  return n;
}

/** CSMS accepts a 7–30 day recovery window for scheduled secret deletion. */
export const SECRET_DELETION_MIN_DAYS = 7;
export const SECRET_DELETION_MAX_DAYS = 30;

/** Defaults when the env vars are unset: prod keeps things longest. */
export const DEFAULT_SECRET_DELETION_DAYS = "prod:30,*:7";
export const DEFAULT_VERSION_RETENTION_DAYS = "prod:30,*:10";

export const ENVIRONMENT_TAG = "environment";
export const CREATED_BY_TAG = "created_by";
export const CREATED_BY_VALUE = "lbox";
/** CSMS's built-in key; when it's the default we simply omit kms_key_id. */
export const CSMS_DEFAULT_KEY_ALIAS = "csms/default";

export interface HuaweiConfig {
  region: string;
  projectId: string;
  /** If set, secrets are created in and only listed from this enterprise project. */
  enterpriseProjectId?: string;
  /** Environments shown as folders, in display order. */
  environments: string[];
  /** Recovery window (days) when a secret is deleted, per environment. */
  secretDeletionDays: EnvMap<number>;
  /** How long a version stays after being "deleted" (expire_time), per environment. */
  versionRetentionDays: EnvMap<number>;
  /** Default KMS key alias for new secrets, per environment. */
  kmsDefaults: EnvMap<string>;
  /** Environments where names are free-form (no "<env>-<project>-" prefix). */
  freeNamingEnvironments: string[];
  auth:
    | { mode: "aksk"; accessKey: string; secretKey: string }
    | {
        mode: "oidc";
        idpId: string;
        issuer: string;
        clientId: string;
        clientSecret: string;
      };
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required for SECRETS_PROVIDER=huawei`);
  return v;
}

export function loadHuaweiConfig(): HuaweiConfig {
  const environments = list(process.env.HUAWEI_ENVIRONMENTS);
  if (environments.length === 0) {
    throw new Error("HUAWEI_ENVIRONMENTS is required (e.g. dev,stage,prod,infra)");
  }

  const secretDeletionDays = parseEnvMap(
    process.env.HUAWEI_SECRET_DELETION_DAYS || DEFAULT_SECRET_DELETION_DAYS,
    SECRET_DELETION_MIN_DAYS,
    int
  );
  for (const d of [secretDeletionDays.fallback, ...Object.values(secretDeletionDays.byEnv)]) {
    if (d < SECRET_DELETION_MIN_DAYS || d > SECRET_DELETION_MAX_DAYS) {
      throw new Error(
        `HUAWEI_SECRET_DELETION_DAYS values must be ${SECRET_DELETION_MIN_DAYS}–${SECRET_DELETION_MAX_DAYS} (CSMS limit), got ${d}`
      );
    }
  }

  const mode = (process.env.HUAWEI_AUTH?.trim().toLowerCase() ||
    (process.env.HUAWEI_ACCESS_KEY ? "aksk" : "oidc")) as HuaweiAuthMode;
  let auth: HuaweiConfig["auth"];
  if (mode === "aksk") {
    auth = {
      mode,
      accessKey: required("HUAWEI_ACCESS_KEY"),
      secretKey: required("HUAWEI_SECRET_KEY"),
    };
  } else if (mode === "oidc") {
    auth = {
      mode,
      idpId: required("HUAWEI_IDP_ID"),
      issuer: required("KEYCLOAK_ISSUER"),
      clientId: process.env.HUAWEI_OIDC_CLIENT_ID?.trim() || required("KEYCLOAK_CLIENT_ID"),
      clientSecret:
        process.env.HUAWEI_OIDC_CLIENT_SECRET?.trim() || required("KEYCLOAK_CLIENT_SECRET"),
    };
  } else {
    throw new Error(`HUAWEI_AUTH must be "aksk" or "oidc", got "${mode}"`);
  }

  return {
    region: required("HUAWEI_REGION"),
    projectId: required("HUAWEI_PROJECT_ID"),
    enterpriseProjectId: process.env.HUAWEI_ENTERPRISE_PROJECT_ID?.trim() || undefined,
    environments,
    secretDeletionDays,
    versionRetentionDays: parseEnvMap(
      process.env.HUAWEI_VERSION_RETENTION_DAYS || DEFAULT_VERSION_RETENTION_DAYS,
      10,
      int
    ),
    kmsDefaults: parseEnvMap(process.env.HUAWEI_KMS_DEFAULTS, CSMS_DEFAULT_KEY_ALIAS, (v) => v),
    freeNamingEnvironments: list(process.env.HUAWEI_FREE_NAMING_ENVS),
    auth,
  };
}

let cached: HuaweiConfig | null = null;
/** Config is read once per process. */
export function getHuaweiConfig(): HuaweiConfig {
  return (cached ??= loadHuaweiConfig());
}
