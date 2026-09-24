import { describe, it, expect } from "vitest";
import { getEnvKind, ENV_BORDER_CLASS } from "./env-accent";

describe("getEnvKind", () => {
  it("treats folders containing 'prod' as production", () => {
    expect(getEnvKind("prod")).toBe("prod");
    expect(getEnvKind("PROD")).toBe("prod");
    expect(getEnvKind("production")).toBe("prod");
    expect(getEnvKind("prod-kz")).toBe("prod");
  });

  it("treats stage and staging as staging", () => {
    expect(getEnvKind("stage")).toBe("stage");
    expect(getEnvKind("staging")).toBe("stage");
    expect(getEnvKind("STAGE")).toBe("stage");
    expect(getEnvKind("stage-kz")).toBe("stage");
  });

  it("lets prod win when a name matches both", () => {
    expect(getEnvKind("prod-staging")).toBe("prod");
  });

  it("treats every other folder as non-production", () => {
    expect(getEnvKind("dev")).toBe("nonprod");
    expect(getEnvKind("test")).toBe("nonprod");
  });

  it("is neutral while no folder is selected", () => {
    expect(getEnvKind(null)).toBe("unknown");
    expect(getEnvKind(undefined)).toBe("unknown");
    expect(getEnvKind("")).toBe("unknown");
    expect(getEnvKind("   ")).toBe("unknown");
  });

  it("maps each kind to a divider colour", () => {
    expect(ENV_BORDER_CLASS.prod).toBe("border-red-500");
    expect(ENV_BORDER_CLASS.stage).toBe("border-yellow-500");
    expect(ENV_BORDER_CLASS.nonprod).toBe("border-green-500");
    expect(ENV_BORDER_CLASS.unknown).toBe("border-border");
  });
});
