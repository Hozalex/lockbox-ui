import { expect, it, vi } from "vitest";
import { ProviderApiError } from "@/lib/providers/types";

vi.mock("./client", () => ({ hwRequest: vi.fn() }));
vi.mock("./config", async (original) => ({
  ...await original<typeof import("./config")>(),
  getHuaweiConfig: () => ({
    region: "example-region-1", projectId: "example-project",
    environments: ["prod", "dev"],
    secretDeletionDays: { fallback: 7, byEnv: {} },
  }),
}));
import { hwRequest } from "./client";
import { huaweiProvider } from "./index";

it("shares a fallback scan between environments, never reads payloads, and invalidates after deletion", async () => {
  const secret = { id: "uuid", name: "example-secret", state: "ENABLED" };
  vi.mocked(hwRequest).mockImplementation(async (request) => {
    if (request.path === "/csms/resource_instances/action") throw new ProviderApiError(403, "denied");
    if (request.path === "/secrets") return { secrets: [secret] };
    if (request.path === "/csms/uuid/tags") return { tags: [{ key: "environment", value: "prod" }] };
    if (request.path === "/secrets/example-secret") return { secret };
    if (request.path.endsWith("/scheduled-deleted-tasks/create")) return {};
    throw new Error(`Unexpected upstream request: ${request.path}`);
  });
  const [first, second] = await Promise.all([
    huaweiProvider.listSecrets("prod"), huaweiProvider.listSecrets("prod"),
  ]);
  expect(first.secrets).toHaveLength(1);
  expect(second.secrets).toEqual(first.secrets);
  expect((await huaweiProvider.listSecrets("dev")).secrets).toEqual([]);
  const scans = () => vi.mocked(hwRequest).mock.calls.filter(([r]) => r.path === "/secrets");
  expect(scans()).toHaveLength(1);
  expect(vi.mocked(hwRequest).mock.calls.some(([r]) => r.path.includes("/versions"))).toBe(false);
  await huaweiProvider.deleteSecret("example-secret");
  await huaweiProvider.listSecrets("prod");
  expect(scans()).toHaveLength(2);
});
