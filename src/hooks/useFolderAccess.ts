"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/session-provider";

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

/** Convenience: can the user write to this folder? */
export function useCanWrite(folderName: string | null): boolean {
  const access = useFolderAccess(folderName);
  return access === "full" || access === "rw";
}
