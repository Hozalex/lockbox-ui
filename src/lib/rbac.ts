/**
 * Role-based access control for Keycloak users.
 *
 * Role format in Keycloak:
 *   lockbox:admin            — superadmin, rw on all folders
 *   lockbox:<folderName>:ro  — read-only access to a folder
 *   lockbox:<folderName>:rw  — read-write access to a folder
 *
 * Folder names must match YC folder names exactly (case-sensitive).
 */

export type FolderAccess = "ro" | "rw";

export interface FolderPermission {
  folderName: string;
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

/**
 * Get the access level for a specific folder by name.
 * Returns null if the user has no access.
 */
export function getFolderAccess(
  roles: string[],
  folderName: string
): FolderAccess | null {
  if (isAdmin(roles)) return "rw";
  const permissions = parseFolderPermissions(roles);
  return permissions.find((p) => p.folderName === folderName)?.access ?? null;
}

/**
 * Get the access level for a folder by its ID, given a name→id mapping.
 * Used in API routes where we have folderId but need to check by name.
 */
export function getFolderAccessById(
  roles: string[],
  folderId: string,
  folderIdToName: Map<string, string>
): FolderAccess | null {
  if (isAdmin(roles)) return "rw";
  const name = folderIdToName.get(folderId);
  if (!name) return null;
  return getFolderAccess(roles, name);
}

/**
 * Filter a list of folders to only those the user can access.
 * Returns folders with their access level attached.
 */
export function filterAllowedFolders<
  T extends { id: string; name: string },
>(roles: string[], folders: T[]): (T & { access: FolderAccess })[] {
  if (isAdmin(roles)) {
    return folders.map((f) => ({ ...f, access: "rw" as const }));
  }

  const permissions = parseFolderPermissions(roles);
  const permMap = new Map(permissions.map((p) => [p.folderName, p.access]));

  return folders
    .filter((f) => permMap.has(f.name))
    .map((f) => ({ ...f, access: permMap.get(f.name)! }));
}

/**
 * Check if the user can write to a folder (by name).
 */
export function canWriteFolder(roles: string[], folderName: string): boolean {
  return getFolderAccess(roles, folderName) === "rw";
}
