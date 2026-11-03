import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Secret, SecretVersion, Operation } from "@/lib/types";
vi.mock("@/lib/yc-api", () => ({
  getSecret: vi.fn(), getFolder: vi.fn(), addVersion: vi.fn(),
  waitOperation: vi.fn(), listVersions: vi.fn(), scheduleVersionDestruction: vi.fn(),
}));
import * as yc from "@/lib/yc-api";
import { addVersionWithRetention, retentionCandidates } from "./yandex-retention";

const version = (n: number, status: SecretVersion["status"] = "ACTIVE") => ({
  id: `v${n}`, createdAt: `2026-01-0${n}T00:00:00Z`, status,
} as SecretVersion);
const operation: Operation = { id: "op", description: "", createdAt: "", done: true, response: { id: "v4" } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(yc.getSecret).mockResolvedValue({ folderId: "folder", currentVersion: version(4) } as Secret);
  vi.mocked(yc.getFolder).mockResolvedValue({ name: "prod" } as Awaited<ReturnType<typeof yc.getFolder>>);
  vi.mocked(yc.addVersion).mockResolvedValue(operation);
  vi.mocked(yc.waitOperation).mockResolvedValue(operation);
  vi.mocked(yc.listVersions).mockResolvedValue({ versions: [version(1), version(4), version(2), version(3)] });
  vi.mocked(yc.scheduleVersionDestruction).mockResolvedValue(operation);
});

describe("Yandex retention", () => {
  it("retains two versions in production and schedules older versions for 30 days", async () => {
    await addVersionWithRetention("secret", { payloadEntries: [] });
    expect(yc.scheduleVersionDestruction).toHaveBeenCalledTimes(2);
    expect(yc.scheduleVersionDestruction).toHaveBeenCalledWith("secret", { versionId: "v2", pendingPeriod: "2592000s" });
    expect(yc.scheduleVersionDestruction).toHaveBeenCalledWith("secret", { versionId: "v1", pendingPeriod: "2592000s" });
  });
  it("keeps only the current version outside production", async () => {
    vi.mocked(yc.getFolder).mockResolvedValue({ name: "stage" } as Awaited<ReturnType<typeof yc.getFolder>>);
    await addVersionWithRetention("secret", { payloadEntries: [] });
    expect(yc.scheduleVersionDestruction).toHaveBeenCalledTimes(3);
    expect(yc.scheduleVersionDestruction).toHaveBeenCalledWith("secret", { versionId: "v3", pendingPeriod: "432000s" });
  });
  it("preserves current after rollback and never reschedules pending versions", () => {
    expect(retentionCandidates([version(4, "SCHEDULED_FOR_DESTRUCTION"), version(3), version(2), version(1)], "v1", 2).map(v => v.id)).toEqual(["v2"]);
  });
  it("does not clean up if creation fails", async () => {
    vi.mocked(yc.addVersion).mockRejectedValue(new Error("failed"));
    await expect(addVersionWithRetention("secret", { payloadEntries: [] })).rejects.toThrow("failed");
    expect(yc.scheduleVersionDestruction).not.toHaveBeenCalled();
  });
  it("reads every page before choosing versions to delete", async () => {
    vi.mocked(yc.listVersions).mockResolvedValueOnce({ versions: [version(1), version(2)], nextPageToken: "next" })
      .mockResolvedValueOnce({ versions: [version(3), version(4)] });
    await addVersionWithRetention("secret", { payloadEntries: [] });
    expect(yc.listVersions).toHaveBeenCalledWith("secret", 100, "next");
    expect(yc.scheduleVersionDestruction).not.toHaveBeenCalledWith("secret", expect.objectContaining({ versionId: "v4" }));
  });
  it("returns a warning rather than a failed creation when cleanup fails", async () => {
    vi.mocked(yc.scheduleVersionDestruction).mockRejectedValue(new Error("denied"));
    const result = await addVersionWithRetention("secret", { payloadEntries: [] });
    expect(result).toMatchObject({ done: true, warnings: [expect.stringContaining("denied")] });
  });
});
