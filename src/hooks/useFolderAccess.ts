"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/session-provider";
import {
  resolveSecretAccess,
  writableProjects,
  type FolderAccess,
} from "@/lib/rbac";

export type FolderAccessLevel = "full" | "rw" | "ro" | "none";

/**
 * Returns the access level for the given folder.
 *
 * - OAuth mode: "full" (no RBAC, access determined by the user's IAM token in YC)
 * - Keycloak mode: parsed from roles (lockbox:admin → "rw" everywhere,
 *   lockbox:<folderName>:rw → "rw", lockbox:<folderName>:ro → "ro")
 * - Not authenticated: "none"
 */
export function useFolderAccess(folderName: string | null): FolderAccessLevel {
  const { authenticated, authMode, roles } = useAuth();

  return useMemo(() => {
    if (!authenticated) return "none";
    if (authMode === "oauth") return "full";
    if (authMode !== "keycloak") return "none";

    // Superadmin
    if (roles.includes("lockbox:admin")) return "rw";

    if (!folderName) return "none";

    // Check per-folder roles
    let access: FolderAccessLevel = "none";
    for (const role of roles) {
      const match = role.match(/^lockbox:([^:]+):(ro|rw)$/);
      if (!match) continue;
      const [, name, level] = match;
      if (name !== folderName) continue;
      if (level === "rw") return "rw";
      if (level === "ro") access = "ro";
    }
    return access;
  }, [authenticated, authMode, roles, folderName]);
}

/**
 * Access level for a single project (label value) inside a folder.
 *
 * - OAuth mode: "full" (no RBAC).
 * - Keycloak mode: max of folder-wide and project-specific roles.
 * - `project === null` means an unlabeled secret — only folder-wide/admin
 *   users get access.
 */
export function useProjectAccess(
  folderName: string | null,
  project: string | null
): FolderAccessLevel {
  const { authenticated, authMode, roles } = useAuth();

  return useMemo(() => {
    if (!authenticated) return "none";
    if (authMode === "oauth") return "full";
    if (authMode !== "keycloak") return "none";
    if (!folderName) return "none";

    const access: FolderAccess | null = resolveSecretAccess(
      roles,
      folderName,
      project
    );
    return access ?? "none";
  }, [authenticated, authMode, roles, folderName, project]);
}

/** Projects (registry names) the user can create secrets in, for a folder. */
export function useWritableProjects(folderName: string | null): string[] {
  const { authMode, roles, projects } = useAuth();

  return useMemo(
    () =>
      writableProjects({
        isOAuth: authMode === "oauth",
        roles,
        folderName,
        registry: projects,
      }),
    [authMode, roles, folderName, projects]
  );
}
