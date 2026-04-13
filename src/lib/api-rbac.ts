import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getSecret, listFolders, listClouds, getFolder } from "@/lib/yc-api";
import { isAdmin, parseFolderPermissions } from "@/lib/rbac";
import type { FolderAccess } from "@/lib/rbac";

/**
 * Determine current auth mode from cookies.
 * Returns "oauth" if OAuth cookies are present, "keycloak" if next-auth session exists.
 */
async function getAuthMode(): Promise<"oauth" | "keycloak" | null> {
  const cookieStore = await cookies();
  if (cookieStore.get("oauth_token")?.value) return "oauth";
  if (
    cookieStore.get("authjs.session-token")?.value ||
    cookieStore.get("__Secure-authjs.session-token")?.value
  ) {
    return "keycloak";
  }
  return null;
}

/**
 * Get Keycloak roles from next-auth session.
 */
async function getKeycloakRoles(): Promise<string[]> {
  const session = await auth();
  return session?.user?.roles || [];
}

// Cache folder id→name mapping (module-level, refreshed periodically)
let folderNameCache: Map<string, string> = new Map();
let folderCacheExpiry = 0;
const FOLDER_CACHE_TTL = 60_000; // 1 minute

async function refreshFolderCache(): Promise<void> {
  if (Date.now() < folderCacheExpiry && folderNameCache.size > 0) return;

  try {
    const cloudsData = await listClouds();
    const clouds = cloudsData.clouds || [];
    const newMap = new Map<string, string>();

    for (const cloud of clouds) {
      const foldersData = await listFolders(cloud.id);
      for (const folder of foldersData.folders || []) {
        newMap.set(folder.id, folder.name);
      }
    }

    folderNameCache = newMap;
    folderCacheExpiry = Date.now() + FOLDER_CACHE_TTL;
  } catch {
    // Keep old cache on error
  }
}

/**
 * Get folder name by ID.
 * First checks cache, then attempts a bulk refresh, then falls back to direct
 * per-folder GET (works even when the SA lacks cloud-level listing permissions).
 */
export async function getFolderName(folderId: string): Promise<string | null> {
  // Fast path: in-cache
  if (folderNameCache.has(folderId) && Date.now() < folderCacheExpiry) {
    return folderNameCache.get(folderId) ?? null;
  }

  // Try bulk refresh (populates cache from listClouds+listFolders)
  await refreshFolderCache();
  if (folderNameCache.has(folderId)) {
    return folderNameCache.get(folderId) ?? null;
  }

  // Fallback: direct GET /folders/{id} — works with only folder-level SA permissions
  try {
    const folder = await getFolder(folderId);
    if (folder?.name) {
      folderNameCache.set(folderId, folder.name);
      return folder.name;
    }
  } catch {
    // ignore — will return null below
  }

  return null;
}

/**
 * Check if the current user has at least the required access level to a folder.
 *
 * For OAuth users: always allowed (access is determined by their IAM token in YC).
 * For Keycloak users: checks roles against folder name.
 *
 * Returns null if allowed, or a NextResponse with 403 if denied.
 */
export async function requireFolderAccess(
  folderId: string,
  requiredAccess: FolderAccess
): Promise<NextResponse | null> {
  const mode = await getAuthMode();

  // OAuth users — no RBAC, YC IAM handles access
  if (mode === "oauth") return null;

  // Not authenticated
  if (mode !== "keycloak") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roles = await getKeycloakRoles();

  // Superadmin — all access
  if (isAdmin(roles)) return null;

  const folderName = await getFolderName(folderId);
  if (!folderName) {
    return NextResponse.json(
      { error: "Каталог не найден" },
      { status: 404 }
    );
  }

  const permissions = parseFolderPermissions(roles);
  const perm = permissions.find((p) => p.folderName === folderName);

  if (!perm) {
    return NextResponse.json(
      { error: "Нет доступа к этому каталогу" },
      { status: 403 }
    );
  }

  // If rw is required but user only has ro
  if (requiredAccess === "rw" && perm.access === "ro") {
    return NextResponse.json(
      { error: "Недостаточно прав. Требуется доступ на запись." },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check folder access for a secret (by secretId).
 * Fetches the secret to determine its folderId, then checks access.
 */
export async function requireSecretAccess(
  secretId: string,
  requiredAccess: FolderAccess
): Promise<NextResponse | null> {
  const mode = await getAuthMode();
  if (mode === "oauth") return null;
  if (mode !== "keycloak") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roles = await getKeycloakRoles();
  if (isAdmin(roles)) return null;

  try {
    const secret = await getSecret(secretId);
    return requireFolderAccess(secret.folderId, requiredAccess);
  } catch {
    // If we can't fetch the secret, let the actual API call handle the error
    return null;
  }
}

/**
 * For Keycloak users: filter folders list to only those they have access to.
 * For OAuth users: return all folders as-is.
 */
export async function filterFoldersByAccess(
  folders: Array<{ id: string; name: string; [key: string]: unknown }>
): Promise<Array<{ id: string; name: string; access?: FolderAccess; [key: string]: unknown }>> {
  const mode = await getAuthMode();
  if (mode === "oauth") return folders;
  if (mode !== "keycloak") return [];

  const roles = await getKeycloakRoles();
  if (isAdmin(roles)) {
    return folders.map((f) => ({ ...f, access: "rw" as const }));
  }

  const permissions = parseFolderPermissions(roles);
  const permMap = new Map(permissions.map((p) => [p.folderName, p.access]));

  return folders
    .filter((f) => permMap.has(f.name))
    .map((f) => ({ ...f, access: permMap.get(f.name) }));
}
