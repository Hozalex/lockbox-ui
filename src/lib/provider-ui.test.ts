import { describe, it, expect } from "vitest";
import {
  namePrefixFor,
  secretDeletionDays,
  versionRetentionDays,
  withoutSystemLabels,
  type ProviderUiPolicy,
} from "./provider-ui";

const huawei: ProviderUiPolicy = {
  secretDeletionDays: { byEnv: { prod: 30 }, fallback: 7 },
  versionRetentionDays: { byEnv: { prod: 30 }, fallback: 10 },
  namePrefix: { exemptFolders: ["infra"] },
  systemLabels: ["environment", "created_by"],
};
const yandex: ProviderUiPolicy = { systemLabels: [] };

describe("namePrefixFor", () => {
  it("builds <folder>-<project>- for providers with a naming rule", () => {
    expect(namePrefixFor(huawei, "dev", "platform")).toBe("dev-platform-");
    expect(namePrefixFor(huawei, "prod", null)).toBe("prod-");
  });

  it("leaves exempt folders (infra) and rule-less providers free-form", () => {
    expect(namePrefixFor(huawei, "infra", "platform")).toBe("");
    expect(namePrefixFor(huawei, "INFRA", null)).toBe("");
    expect(namePrefixFor(yandex, "dev", "platform")).toBe("");
    expect(namePrefixFor(huawei, null, "platform")).toBe("");
  });
});

describe("retention helpers", () => {
  it("reads per-folder days with a fallback", () => {
    expect(secretDeletionDays(huawei, "prod")).toBe(30);
    expect(secretDeletionDays(huawei, "dev")).toBe(7);
    expect(versionRetentionDays(huawei, "dev")).toBe(10);
    expect(versionRetentionDays(huawei, "prod")).toBe(30);
  });

  it("is undefined when the provider has no such policy", () => {
    expect(secretDeletionDays(yandex, "prod")).toBeUndefined();
    expect(versionRetentionDays(huawei, null)).toBeUndefined();
  });
});

describe("withoutSystemLabels", () => {
  it("drops provider-managed labels", () => {
    const labels = [{ key: "environment" }, { key: "team" }, { key: " created_by " }];
    expect(withoutSystemLabels(huawei, labels)).toEqual([{ key: "team" }]);
    expect(withoutSystemLabels(yandex, labels)).toHaveLength(3);
  });
});
