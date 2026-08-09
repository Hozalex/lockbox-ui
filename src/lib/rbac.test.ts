import { describe, it, expect } from "vitest";
import {
  parseFolderPermissions,
  parseProjectPermissions,
  resolveSecretAccess,
  hasFolderWideAccess,
  folderHasAnyAccess,
  folderTopAccess,
  writableProjects,
  computeProjectTabs,
  normalizeProject,
  isAdmin,
} from "./rbac";

const REGISTRY = ["sample-app", "billing"];

describe("parseFolderPermissions", () => {
  it("parses folder-wide roles and ignores project / admin roles", () => {
    const roles = [
      "lockbox:admin",
      "lockbox:dev:rw",
      "lockbox:prod:ro",
      "lockbox:dev:sample-app:rw", // project role — must NOT match here
      "unrelated:role",
    ];
    expect(parseFolderPermissions(roles)).toEqual([
      { folderName: "dev", access: "rw" },
      { folderName: "prod", access: "ro" },
    ]);
  });
});

describe("parseProjectPermissions", () => {
  it("parses 4-segment project roles only, lowercasing the project", () => {
    const roles = [
      "lockbox:dev:Sample-App:rw",
      "lockbox:dev:billing:ro",
      "lockbox:dev:rw", // folder-wide — must NOT match here
      "lockbox:admin",
    ];
    expect(parseProjectPermissions(roles)).toEqual([
      { folderName: "dev", project: "sample-app", access: "rw" },
      { folderName: "dev", project: "billing", access: "ro" },
    ]);
  });
});

describe("isAdmin", () => {
  it("detects the superadmin role", () => {
    expect(isAdmin(["lockbox:admin"])).toBe(true);
    expect(isAdmin(["lockbox:dev:rw"])).toBe(false);
  });
});

describe("normalizeProject", () => {
  it("returns the lowercased project when in the registry", () => {
    expect(normalizeProject({ project: "Sample-App" }, REGISTRY)).toBe("sample-app");
    expect(normalizeProject({ project: "billing" }, REGISTRY)).toBe("billing");
  });
  it("returns null for missing or out-of-registry labels", () => {
    expect(normalizeProject(undefined, REGISTRY)).toBeNull();
    expect(normalizeProject({}, REGISTRY)).toBeNull();
    expect(normalizeProject({ project: "" }, REGISTRY)).toBeNull();
    expect(normalizeProject({ project: "ghost" }, REGISTRY)).toBeNull();
    expect(normalizeProject({ env: "prod" }, REGISTRY)).toBeNull();
  });
});

describe("resolveSecretAccess", () => {
  it("admin gets rw everywhere, including unlabeled", () => {
    expect(resolveSecretAccess(["lockbox:admin"], "dev", null)).toBe("rw");
    expect(resolveSecretAccess(["lockbox:admin"], "dev", "sample-app")).toBe("rw");
  });

  it("folder-wide role covers every project and unlabeled secrets", () => {
    const roles = ["lockbox:dev:ro"];
    expect(resolveSecretAccess(roles, "dev", "sample-app")).toBe("ro");
    expect(resolveSecretAccess(roles, "dev", null)).toBe("ro");
    expect(resolveSecretAccess(roles, "prod", "sample-app")).toBeNull();
  });

  it("project role grants access only to its own project, not unlabeled", () => {
    const roles = ["lockbox:dev:sample-app:rw"];
    expect(resolveSecretAccess(roles, "dev", "sample-app")).toBe("rw");
    expect(resolveSecretAccess(roles, "dev", "billing")).toBeNull();
    expect(resolveSecretAccess(roles, "dev", null)).toBeNull();
  });

  it("takes the max of folder-wide and project roles", () => {
    const roles = ["lockbox:dev:ro", "lockbox:dev:sample-app:rw"];
    expect(resolveSecretAccess(roles, "dev", "sample-app")).toBe("rw"); // project bumps to rw
    expect(resolveSecretAccess(roles, "dev", "billing")).toBe("ro"); // folder-wide floor
  });

  it("returns null when the user has no relevant role", () => {
    expect(resolveSecretAccess([], "dev", "sample-app")).toBeNull();
  });
});

describe("hasFolderWideAccess / folderHasAnyAccess / folderTopAccess", () => {
  it("folder-wide is true only for admin or folder-level roles", () => {
    expect(hasFolderWideAccess(["lockbox:admin"], "dev")).toBe(true);
    expect(hasFolderWideAccess(["lockbox:dev:ro"], "dev")).toBe(true);
    expect(hasFolderWideAccess(["lockbox:dev:sample-app:rw"], "dev")).toBe(false);
  });

  it("any-access includes project-only roles", () => {
    expect(folderHasAnyAccess(["lockbox:dev:sample-app:rw"], "dev")).toBe(true);
    expect(folderHasAnyAccess(["lockbox:dev:sample-app:rw"], "prod")).toBe(false);
    expect(folderHasAnyAccess([], "dev")).toBe(false);
  });

  it("top access is the max over folder-wide and project roles", () => {
    expect(folderTopAccess(["lockbox:dev:ro", "lockbox:dev:sample-app:rw"], "dev")).toBe("rw");
    expect(folderTopAccess(["lockbox:dev:billing:ro"], "dev")).toBe("ro");
    expect(folderTopAccess(["lockbox:admin"], "anything")).toBe("rw");
    expect(folderTopAccess([], "dev")).toBeNull();
  });
});

describe("writableProjects", () => {
  it("OAuth users may create in any registry project", () => {
    expect(
      writableProjects({ isOAuth: true, roles: [], folderName: "dev", registry: REGISTRY })
    ).toEqual(REGISTRY);
  });

  it("Keycloak users only get projects they have rw on", () => {
    const roles = ["lockbox:dev:sample-app:rw", "lockbox:dev:billing:ro"];
    expect(
      writableProjects({ isOAuth: false, roles, folderName: "dev", registry: REGISTRY })
    ).toEqual(["sample-app"]);
  });

  it("admin / folder-wide rw can create in all registry projects", () => {
    expect(
      writableProjects({ isOAuth: false, roles: ["lockbox:admin"], folderName: "dev", registry: REGISTRY })
    ).toEqual(REGISTRY);
    expect(
      writableProjects({ isOAuth: false, roles: ["lockbox:dev:rw"], folderName: "dev", registry: REGISTRY })
    ).toEqual(REGISTRY);
  });

  it("returns nothing without a folder", () => {
    expect(
      writableProjects({ isOAuth: false, roles: ["lockbox:dev:sample-app:rw"], folderName: null, registry: REGISTRY })
    ).toEqual([]);
  });
});

describe("computeProjectTabs", () => {
  it("project-only user: rw project shown even when empty, ro project only when populated, no 'Все'/'Без проекта'", () => {
    const tabs = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:dev:sample-app:rw", "lockbox:dev:billing:ro"],
      folderName: "dev",
      registry: REGISTRY,
      secretProjects: [], // no secrets yet
    });
    expect(tabs.map((t) => t.key)).toEqual(["sample-app"]); // billing ro+empty hidden
    expect(tabs[0]).toMatchObject({ project: "sample-app", access: "rw", canCreate: true });
  });

  it("project-only user: ro project appears once it has secrets", () => {
    const tabs = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:dev:billing:ro"],
      folderName: "dev",
      registry: REGISTRY,
      secretProjects: ["billing"],
    });
    expect(tabs.map((t) => t.key)).toEqual(["billing"]);
    expect(tabs[0]).toMatchObject({ access: "ro", canCreate: false });
  });

  it("folder-wide user gets an 'Все' tab and a 'Без проекта' tab for unlabeled secrets", () => {
    const tabs = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:dev:rw"],
      folderName: "dev",
      registry: REGISTRY,
      secretProjects: ["sample-app", null],
    });
    const keys = tabs.map((t) => t.key);
    expect(keys[0]).toBe("all");
    expect(keys).toContain("sample-app");
    expect(keys).toContain("__none__");
    // every registry project is creatable for folder-wide rw
    expect(tabs.find((t) => t.key === "sample-app")).toMatchObject({ canCreate: true });
  });

  it("OAuth user gets 'Все' plus a tab for every registry project (even empty ones)", () => {
    const tabs = computeProjectTabs({
      isOAuth: true,
      roles: [],
      folderName: "dev",
      registry: REGISTRY,
      secretProjects: ["sample-app", "sample-app"],
    });
    const keys = tabs.map((t) => t.key);
    expect(keys).toEqual(["all", "sample-app", "billing"]); // billing shown though empty
    expect(tabs.every((t) => t.access === "rw")).toBe(true);
    expect(tabs.filter((t) => t.kind === "project").every((t) => t.canCreate)).toBe(true);
  });

  it("'Все' tab reflects real folder access (ro) and is not creatable when registry is non-empty", () => {
    const tabs = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:dev:ro"],
      folderName: "dev",
      registry: REGISTRY,
      secretProjects: ["sample-app"],
    });
    const all = tabs.find((t) => t.key === "all");
    expect(all).toMatchObject({ access: "ro", canCreate: false });
  });

  it("empty registry: 'Все' tab is creatable for folder-wide rw and OAuth, but not folder-wide ro", () => {
    const rw = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:dev:rw"],
      folderName: "dev",
      registry: [],
      secretProjects: [],
    });
    expect(rw.map((t) => t.key)).toEqual(["all"]);
    expect(rw[0]).toMatchObject({ kind: "all", canCreate: true });

    const ro = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:dev:ro"],
      folderName: "dev",
      registry: [],
      secretProjects: [],
    });
    expect(ro[0]).toMatchObject({ canCreate: false });

    const oauth = computeProjectTabs({
      isOAuth: true,
      roles: [],
      folderName: "dev",
      registry: [],
      secretProjects: [],
    });
    expect(oauth[0]).toMatchObject({ kind: "all", canCreate: true });
  });

  it("admin can create from the 'Все' tab (unlabeled) even with a non-empty registry", () => {
    const tabs = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:admin"],
      folderName: "dev",
      registry: REGISTRY,
      secretProjects: [],
    });
    const all = tabs.find((t) => t.key === "all");
    expect(all).toMatchObject({ kind: "all", canCreate: true });
  });

  it("non-admin folder-wide rw still cannot create unlabeled from 'Все' (registry non-empty)", () => {
    const tabs = computeProjectTabs({
      isOAuth: false,
      roles: ["lockbox:dev:rw"],
      folderName: "dev",
      registry: REGISTRY,
      secretProjects: [],
    });
    const all = tabs.find((t) => t.key === "all");
    expect(all).toMatchObject({ kind: "all", canCreate: false });
  });

  it("no access produces no tabs", () => {
    expect(
      computeProjectTabs({
        isOAuth: false,
        roles: [],
        folderName: "dev",
        registry: REGISTRY,
        secretProjects: [],
      })
    ).toEqual([]);
  });
});
