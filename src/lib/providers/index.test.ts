import { describe, it, expect, afterEach } from "vitest";
import { getProviderId, getSecretsProvider } from "./index";

const original = process.env.SECRETS_PROVIDER;
afterEach(() => {
  if (original === undefined) delete process.env.SECRETS_PROVIDER;
  else process.env.SECRETS_PROVIDER = original;
});

describe("getProviderId", () => {
  it("defaults to yandex when unset", () => {
    delete process.env.SECRETS_PROVIDER;
    expect(getProviderId()).toBe("yandex");
  });

  it("accepts yandex and huawei, case- and space-insensitive", () => {
    process.env.SECRETS_PROVIDER = " Yandex ";
    expect(getProviderId()).toBe("yandex");
    process.env.SECRETS_PROVIDER = "HUAWEI";
    expect(getProviderId()).toBe("huawei");
  });

  it("rejects unknown providers", () => {
    process.env.SECRETS_PROVIDER = "aws";
    expect(() => getProviderId()).toThrow(/Unknown SECRETS_PROVIDER/);
  });
});

describe("getSecretsProvider", () => {
  it("returns the yandex provider by default", () => {
    delete process.env.SECRETS_PROVIDER;
    const p = getSecretsProvider();
    expect(p.id).toBe("yandex");
    expect(p.capabilities.tokenLogin).toBe(true);
  });

  it("validates IDs with YC rules for yandex", () => {
    delete process.env.SECRETS_PROVIDER;
    const p = getSecretsProvider();
    expect(p.validateResourceId("e6qm3k6j2tk4hd5g0s6t", "secretId")).toBeNull();
    expect(p.validateResourceId("Bad_ID", "secretId")).not.toBeNull();
  });

  it("returns the huawei provider with its capabilities", () => {
    process.env.SECRETS_PROVIDER = "huawei";
    const p = getSecretsProvider();
    expect(p.id).toBe("huawei");
    expect(p.capabilities).toMatchObject({
      tokenLogin: false,
      renameSecret: false,
      deferredSecretDeletion: true,
      versionDestructionCancel: false,
    });
    expect(typeof p.restoreSecret).toBe("function");
  });

  it("validates IDs with Huawei rules for huawei", () => {
    process.env.SECRETS_PROVIDER = "huawei";
    const p = getSecretsProvider();
    expect(p.validateResourceId("dev-platform-Redis_secrets", "secretId")).toBeNull();
    expect(p.validateResourceId("bad.name", "secretId")).not.toBeNull();
    expect(p.validateResourceId("v12", "versionId")).toBeNull();
    expect(p.validateResourceId("latest", "versionId")).not.toBeNull();
    expect(p.validateResourceId("dev", "folderId")).toBeNull();
  });
});

describe("tokenLoginEnabled", () => {
  it("agrees with each provider's tokenLogin capability (security invariant)", async () => {
    const { tokenLoginEnabled } = await import("./id");
    for (const id of ["yandex", "huawei"]) {
      process.env.SECRETS_PROVIDER = id;
      expect(tokenLoginEnabled()).toBe(getSecretsProvider().capabilities.tokenLogin);
    }
  });
});
