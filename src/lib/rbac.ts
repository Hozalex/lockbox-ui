/**
 * Role-based access control for Keycloak users.
 *
 * Role format in Keycloak:
 *   lockbox:admin                      — superadmin, rw on all folders/projects
 *   lockbox:<folderName>:ro|rw         — folder-wide access (all projects + unlabeled)
 *   lockbox:<folderName>:<project>:ro|rw — access to a single project inside a folder
 *
 * A "project" is the value of a secret's `project` label. Valid project names
 * come from a server-side registry (LOCKBOX_PROJECTS env). A secret whose
 * `project` label is missing or not in the registry is treated as "no project"
 * and is only visible to folder-wide / admin users.
 *
 * Folder names must match YC folder names exactly (case-sensitive). Project
 * names (label values) are compared case-insensitively / lowercased.
 *
 * This module is client-safe: pure functions only, no env / server imports.
 */

export type FolderAccess = "ro" | "rw";

export const PROJECT_LABEL_KEY = "project";

export interface FolderPermission {
  folderName: string;
  access: FolderAccess;
}

export interface ProjectPermission {
  folderName: string;
  project: string;
  access: FolderAccess;
}

/**
 * Check if the user has the superadmin role.
 */
export function isAdmin(roles: string[]): boolean {
  return roles.includes("lockbox:admin");
}

/**
 * Parse Keycloak roles into per-folder permissions.
 * If a user has both ro and rw for the same folder, rw wins.
 */
export function parseFolderPermissions(roles: string[]): FolderPermission[] {
  const map = new Map<string, FolderAccess>();

  for (const role of roles) {
    const match = role.match(/^lockbox:([^:]+):(ro|rw)$/);
    if (!match) continue;
    const [, folderName, access] = match as [string, string, FolderAccess];
    // rw overrides ro
    if (access === "rw" || !map.has(folderName)) {
      map.set(folderName, access);
    }
  }

  return Array.from(map, ([folderName, access]) => ({ folderName, access }));
}

// ---------------------------------------------------------------------------
// Project-level (intra-folder) access
// ---------------------------------------------------------------------------

/**
 * Normalize a secret's `project` label against the registry of valid project
 * names. Returns the lowercased project name, or null if the label is missing
 * or not a known project (such secrets are "unlabeled" for access purposes).
 */
export function normalizeProject(
  labels: Record<string, string> | undefined,
  registry: string[]
): string | null {
  const raw = labels?.[PROJECT_LABEL_KEY]?.trim().toLowerCase();
  if (!raw) return null;
  // Registry entries are already lowercased (getProjectRegistry / /api/config).
  return registry.includes(raw) ? raw : null;
}

/**
 * Parse Keycloak roles into per-project permissions.
 * Matches `lockbox:<folder>:<project>:(ro|rw)` (4 segments), which is disjoint
 * from the 3-segment folder-wide role format.
 */
export function parseProjectPermissions(roles: string[]): ProjectPermission[] {
  const out: ProjectPermission[] = [];
  for (const role of roles) {
    const match = role.match(/^lockbox:([^:]+):([^:]+):(ro|rw)$/);
    if (!match) continue;
    const [, folderName, project, access] = match;
    out.push({
      folderName,
      project: project.toLowerCase(),
      access: access as FolderAccess,
    });
  }
  return out;
}

/** True if the user has folder-wide access (admin or `lockbox:<folder>:*`). */
export function hasFolderWideAccess(
  roles: string[],
  folderName: string
): boolean {
  if (isAdmin(roles)) return true;
  return parseFolderPermissions(roles).some((p) => p.folderName === folderName);
}

/**
 * Build a reusable access resolver for one folder by parsing the role array
 * ONCE. The returned function maps a normalized project (null = unlabeled) to
 * its effective access level. Prefer this over calling resolveSecretAccess in a
 * loop — it avoids re-scanning the roles for every secret/project.
 */
export function makeSecretAccessResolver(
  roles: string[],
  folderName: string
): (project: string | null) => FolderAccess | null {
  if (isAdmin(roles)) return () => "rw";

  const folderPerm =
    parseFolderPermissions(roles).find((p) => p.folderName === folderName)
      ?.access ?? null;

  const projectPerms = new Map<string, FolderAccess>();
  for (const pp of parseProjectPermissions(roles)) {
    if (pp.folderName !== folderName) continue;
    // rw overrides ro for the same project
    if (pp.access === "rw" || !projectPerms.has(pp.project)) {
      projectPerms.set(pp.project, pp.access);
    }
  }

  return (project) => {
    let best: FolderAccess | null = folderPerm;
    if (project) {
      const pa = projectPerms.get(project);
      if (pa === "rw") best = "rw";
      else if (pa === "ro" && best === null) best = "ro";
    }
    return best;
  };
}

/**
 * Resolve the effective access level for a single secret, given its folder and
 * normalized project (null = unlabeled). Folder-wide roles cover every project
 * (and unlabeled secrets); project roles cover only their own project.
 *
 * Convenience wrapper around makeSecretAccessResolver for single lookups.
 */
export function resolveSecretAccess(
  roles: string[],
  folderName: string,
  project: string | null
): FolderAccess | null {
  return makeSecretAccessResolver(roles, folderName)(project);
}

/**
 * True if the user can see the folder at all — folder-wide access OR at least
 * one project role inside it. Used to gate the secrets-list endpoint and the
 * folder selector.
 */
export function folderHasAnyAccess(
  roles: string[],
  folderName: string
): boolean {
  if (hasFolderWideAccess(roles, folderName)) return true;
  return parseProjectPermissions(roles).some(
    (p) => p.folderName === folderName
  );
}

/**
 * Highest access level the user has anywhere in a folder (folder-wide or any
 * project). Used to annotate folders in the selector. Null if no access.
 */
export function folderTopAccess(
  roles: string[],
  folderName: string
): FolderAccess | null {
  if (isAdmin(roles)) return "rw";
  let best: FolderAccess | null = null;
  const bump = (a: FolderAccess) => {
    if (a === "rw") best = "rw";
    else if (best === null) best = "ro";
  };
  for (const p of parseFolderPermissions(roles)) {
    if (p.folderName === folderName) bump(p.access);
  }
  for (const p of parseProjectPermissions(roles)) {
    if (p.folderName === folderName) bump(p.access);
  }
  return best;
}

/** Registry projects the user may create secrets in (has rw) within a folder. */
export function writableProjects(opts: {
  isOAuth: boolean;
  roles: string[];
  folderName: string | null;
  registry: string[];
}): string[] {
  const { isOAuth, roles, folderName, registry } = opts;
  if (isOAuth) return [...registry];
  if (!folderName) return [];
  const resolve = makeSecretAccessResolver(roles, folderName);
  return registry.filter((p) => resolve(p.toLowerCase()) === "rw");
}

export type ProjectTabKind = "all" | "project" | "none";

export interface ProjectTab {
  /** Stable key for the tab control. */
  key: string;
  label: string;
  /** Normalized project name, or null for the "all"/"none" pseudo-tabs. */
  project: string | null;
  kind: ProjectTabKind;
  access: FolderAccess;
  /** Whether the user can create a secret from this tab (rw on a real project). */
  canCreate: boolean;
}

/**
 * Build the set of project tabs to render for a folder, from the user's roles,
 * the project registry, and the projects present among the (already
 * access-filtered) visible secrets.
 *
 * - OAuth / folder-wide / admin users get an "Все" tab and a "Без проекта" tab
 *   (when unlabeled secrets exist). OAuth users see a tab for every registry
 *   project; Keycloak users see a writable project tab even when empty (so the
 *   first secret can be created) and a read-only one only when it has secrets.
 * - When the registry is empty the project feature is off: the "Все" tab itself
 *   becomes creatable for users with folder write access (back-compat).
 */
export function computeProjectTabs(opts: {
  isOAuth: boolean;
  roles: string[];
  folderName: string | null;
  registry: string[];
  secretProjects: (string | null)[];
}): ProjectTab[] {
  const { isOAuth, roles, folderName, registry, secretProjects } = opts;

  const counts = new Map<string | null, number>();
  for (const p of secretProjects) counts.set(p, (counts.get(p) ?? 0) + 1);

  const resolve = folderName
    ? makeSecretAccessResolver(roles, folderName)
    : () => null;
  const folderWide = folderName
    ? hasFolderWideAccess(roles, folderName)
    : false;
  const showAll = isOAuth || folderWide;
  const registryEmpty = registry.length === 0;

  const tabs: ProjectTab[] = [];

  if (showAll) {
    // Real folder-level access for the overview tab (OAuth = full write).
    const allAccess: FolderAccess = isOAuth
      ? "rw"
      : (folderName ? folderTopAccess(roles, folderName) : null) ?? "ro";
    tabs.push({
      key: "all",
      label: "Все",
      project: null,
      kind: "all",
      access: allAccess,
      // With no registry, project labels aren't required — allow creating an
      // unlabeled secret straight from the overview if the user can write.
      canCreate: registryEmpty && (isOAuth || allAccess === "rw"),
    });
  }

  for (const project of registry) {
    const norm = project.toLowerCase();
    const count = counts.get(norm) ?? 0;
    // OAuth users may create in any project, so show every registry project.
    const access: FolderAccess | null = isOAuth ? "rw" : resolve(norm);
    if (!access) continue;
    if (count === 0 && access !== "rw") continue;
    tabs.push({
      key: norm,
      label: project,
      project: norm,
      kind: "project",
      access,
      canCreate: access === "rw",
    });
  }

  const noneCount = counts.get(null) ?? 0;
  if (noneCount > 0 && showAll) {
    tabs.push({
      key: "__none__",
      label: "Без проекта",
      project: null,
      kind: "none",
      access: "ro",
      canCreate: false,
    });
  }

  return tabs;
}
