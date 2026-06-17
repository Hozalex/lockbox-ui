import { describe, it, expect, afterEach } from "vitest";
import { getProjectRegistry } from "./projects";

const original = process.env.LOCKBOX_PROJECTS;

afterEach(() => {
  if (original === undefined) delete process.env.LOCKBOX_PROJECTS;
  else process.env.LOCKBOX_PROJECTS = original;
});

describe("getProjectRegistry", () => {
  it("returns an empty list when unset", () => {
    delete process.env.LOCKBOX_PROJECTS;
    expect(getProjectRegistry()).toEqual([]);
  });

  it("splits, trims, lowercases and drops empty entries", () => {
    process.env.LOCKBOX_PROJECTS = " Sample-App , billing,, ALPHA ";
    expect(getProjectRegistry()).toEqual(["sample-app", "billing", "alpha"]);
  });
});
