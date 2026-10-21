import { describe, it, expect, afterEach } from "vitest";
import { envMapGet, loadHuaweiConfig, parseEnvMap } from "./config";

const KEYS = [
  "HUAWEI_ENVIRONMENTS", "HUAWEI_REGION", "HUAWEI_PROJECT_ID", "HUAWEI_ENTERPRISE_PROJECT_ID",
  "HUAWEI_AUTH", "HUAWEI_ACCESS_KEY", "HUAWEI_SECRET_KEY", "HUAWEI_SECRET_DELETION_DAYS",
  "HUAWEI_VERSION_RETENTION_DAYS", "HUAWEI_KMS_DEFAULTS", "HUAWEI_IDP_ID",
];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function base() {
  for (const k of KEYS) delete process.env[k];
  process.env.HUAWEI_ENVIRONMENTS = "dev, stage, PROD, infra";
  process.env.HUAWEI_REGION = "la-south-2";
  process.env.HUAWEI_PROJECT_ID = "p1";
  process.env.HUAWEI_ACCESS_KEY = "ak";
  process.env.HUAWEI_SECRET_KEY = "sk";
}

describe("parseEnvMap", () => {
  it("reads per-env values with a * fallback", () => {
    const m = parseEnvMap("prod:30, infra:30 ,*:7", 1, Number);
    expect(envMapGet(m, "prod")).toBe(30);
    expect(envMapGet(m, "PROD")).toBe(30);
    expect(envMapGet(m, "dev")).toBe(7);
  });

  it("keeps values containing colons (aliases like csms/default)", () => {
    expect(envMapGet(parseEnvMap("prod:csms-prod", "csms/default", (v) => v), "dev")).toBe("csms/default");
  });
});

describe("loadHuaweiConfig", () => {
  it("applies the agreed defaults: prod 30 days, others 7 / 10", () => {
    base();
    const c = loadHuaweiConfig();
    expect(c.environments).toEqual(["dev", "stage", "prod", "infra"]);
    expect(envMapGet(c.secretDeletionDays, "prod")).toBe(30);
    expect(envMapGet(c.secretDeletionDays, "dev")).toBe(7);
    expect(envMapGet(c.versionRetentionDays, "prod")).toBe(30);
    expect(envMapGet(c.versionRetentionDays, "dev")).toBe(10);
    expect(envMapGet(c.kmsDefaults, "dev")).toBe("csms/default");
    expect(c.auth.mode).toBe("aksk");
  });

  it("rejects deletion windows CSMS doesn't accept (7–30 days)", () => {
    base();
    process.env.HUAWEI_SECRET_DELETION_DAYS = "dev:3";
    expect(() => loadHuaweiConfig()).toThrow(/7–30/);
  });

  it("requires the OIDC settings when HUAWEI_AUTH=oidc", () => {
    base();
    delete process.env.HUAWEI_ACCESS_KEY;
    process.env.HUAWEI_AUTH = "oidc";
    expect(() => loadHuaweiConfig()).toThrow(/HUAWEI_IDP_ID/);
  });

  it("requires the environment list", () => {
    base();
    delete process.env.HUAWEI_ENVIRONMENTS;
    expect(() => loadHuaweiConfig()).toThrow(/HUAWEI_ENVIRONMENTS/);
  });
});
