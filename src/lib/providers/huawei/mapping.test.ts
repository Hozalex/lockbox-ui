import { describe, it, expect } from "vitest";
import {
  applyPayloadChanges,
  currentVersionId,
  diffTags,
  ensureNamePrefix,
  labelsFromTags,
  mapSecret,
  mapVersion,
  parsePayload,
  requirePlainText,
  serializeEntries,
  userLabels,
} from "./mapping";

describe("payload", () => {
  it("parses a JSON object into entries, stringifying non-string values", () => {
    const p = parsePayload({ secret_string: '{"DB_PASS":"x","PORT":5432,"cfg":{"a":1}}' });
    expect(p.format).toBe("json");
    expect(p.entries).toEqual([
      { key: "DB_PASS", textValue: "x" },
      { key: "PORT", textValue: "5432" },
      { key: "cfg", textValue: '{"a":1}' },
    ]);
  });

  it("treats a non-JSON string as a single plain 'value' entry", () => {
    expect(parsePayload({ secret_string: "hunter2" })).toEqual({
      format: "plain",
      entries: [{ key: "value", textValue: "hunter2" }],
    });
    expect(parsePayload({ secret_string: "[1,2]" }).format).toBe("plain");
  });

  it("exposes binary secrets as a single binary entry", () => {
    expect(parsePayload({ secret_binary: "AAEC" })).toEqual({
      format: "binary",
      entries: [{ key: "binary", binaryValue: "AAEC" }],
    });
  });

  it("serializes entries back to a JSON object", () => {
    expect(serializeEntries([{ key: "A", textValue: "1" }, { key: "B" }])).toBe('{"A":"1","B":""}');
  });

  it("applies set and delete changes on top of the current value", () => {
    const cur = parsePayload({ secret_string: '{"A":"1","B":"2"}' });
    const out = applyPayloadChanges(cur, [{ key: "B" }, { key: "C", textValue: "3" }, { key: "A", textValue: "9" }]);
    expect(JSON.parse(out)).toEqual({ A: "9", C: "3" });
  });

  it("keeps a plain secret plain when only its value changes", () => {
    const cur = parsePayload({ secret_string: "old" });
    expect(applyPayloadChanges(cur, [{ key: "value", textValue: "new" }])).toBe("new");
    // adding a second key turns it into JSON
    expect(JSON.parse(applyPayloadChanges(cur, [{ key: "X", textValue: "1" }]))).toEqual({ value: "old", X: "1" });
  });

  it("refuses to empty a secret or edit a binary one", () => {
    expect(() => applyPayloadChanges(parsePayload({ secret_string: '{"A":"1"}' }), [{ key: "A" }])).toThrow(/пустым/);
    expect(() => applyPayloadChanges(parsePayload({ secret_binary: "AA" }), [])).toThrow(/Бинарные/);
  });
});

describe("tags", () => {
  const tags = [
    { key: "environment", value: "dev" },
    { key: "created_by", value: "manual" },
    { key: "project", value: "platform" },
    { key: "team", value: "core" },
  ];

  it("hides the environment tag from labels (it is the folder)", () => {
    expect(labelsFromTags(tags)).toEqual({ created_by: "manual", project: "platform", team: "core" });
  });

  it("strips system tags from user-supplied labels", () => {
    expect(userLabels({ environment: "prod", created_by: "me", project: "polaris" })).toEqual({ project: "polaris" });
  });

  it("diffs labels without ever touching environment or created_by", () => {
    const { remove, add } = diffTags(tags, { project: "polaris", owner: "ops", environment: "prod" });
    expect(remove).toEqual([
      { key: "project", value: "platform" },
      { key: "team", value: "core" },
    ]);
    expect(add).toEqual([
      { key: "project", value: "polaris" },
      { key: "owner", value: "ops" },
    ]);
  });

  it("produces no changes when labels are unchanged", () => {
    expect(diffTags(tags, { project: "platform", team: "core", created_by: "manual" })).toEqual({ remove: [], add: [] });
  });
});

describe("names", () => {
  it("prefixes <env>-<project>- unless already present", () => {
    expect(ensureNamePrefix("redis", "dev", "platform")).toBe("dev-platform-redis");
    expect(ensureNamePrefix("dev-platform-redis", "dev", "platform")).toBe("dev-platform-redis");
    expect(ensureNamePrefix("argocd", "infra")).toBe("infra-argocd");
  });

  it("rejects names CSMS would not accept", () => {
    expect(() => ensureNamePrefix("bad.name", "dev", "platform")).toThrow(/Некорректное имя/);
    expect(() => ensureNamePrefix("x".repeat(60), "dev", "platform")).toThrow(/до 64/);
  });
});

describe("versions & secrets", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");

  it("maps expire_time to scheduled / expired", () => {
    expect(mapVersion("s", { id: "v1", version_stages: ["SYSCURRENT"], create_time: now }, now).status).toBe("ACTIVE");
    const scheduled = mapVersion("s", { id: "v2", expire_time: now + 1000 }, now);
    expect(scheduled.status).toBe("SCHEDULED_FOR_DESTRUCTION");
    expect(scheduled.destroyAt).toBe(new Date(now + 1000).toISOString());
    expect(mapVersion("s", { id: "v3", expire_time: now - 1000 }, now).status).toBe("EXPIRED");
  });

  it("finds the SYSCURRENT version", () => {
    expect(currentVersionId([{ id: "v1", version_stages: ["SYSPREVIOUS"] }, { id: "v2", version_stages: ["SYSCURRENT"] }])).toBe("v2");
    expect(currentVersionId([{ id: "v1" }])).toBeUndefined();
  });

  it("maps a CSMS secret: id = name, folder = environment tag, pending deletion", () => {
    const s = mapSecret(
      { id: "uuid-1", name: "dev-platform-x", state: "PENDING_DELETE", create_time: now, scheduled_delete_time: now + 7 * 864e5 },
      [{ key: "environment", value: "dev" }, { key: "project", value: "platform" }]
    );
    expect(s).toMatchObject({
      id: "dev-platform-x",
      folderId: "dev",
      status: "PENDING_DELETION",
      labels: { project: "platform" },
      deletionProtection: false,
      deletionScheduledAt: new Date(now + 7 * 864e5).toISOString(),
    });
  });
});

describe("requirePlainText", () => {
  it("keeps multi-line text as is", () => {
    expect(requirePlainText("a:\n  b: 1\n")).toBe("a:\n  b: 1\n");
  });
  it("rejects empty or non-string values", () => {
    expect(() => requirePlainText("")).toThrow();
    expect(() => requirePlainText(5)).toThrow();
  });
});
