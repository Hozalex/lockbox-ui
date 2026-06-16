import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getSecret, listFolders, listClouds, getFolder } from "@/lib/yc-api";
import {
  isAdmin,
  folderHasAnyAccess,
  hasFolderWideAccess,
  folderTopAccess,
  resolveSecretAccess,
  makeSecretAccessResolver,
  normalizeProject,
} from "@/lib/rbac";
import { getProjectRegistry } from "@/lib/projects";
import type { FolderAccess } from "@/lib/rbac";
import type { Secret, UpdateSecretRequest } from "@/lib/types";

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
 * Allow viewing a folder's contents (secrets list, KMS keys) if the user has
 * any access inside it — folder-wide OR at least one project role. The actual
 * per-secret filtering is done separately by filterSecretsByProjectAccess.
 *
 * Returns null if allowed, or a NextResponse (401/403) if denied.
 */
export async function requireFolderViewAccess(
  folderId: string
): Promise<NextResponse | null> {
  const mode = await getAuthMode();
  if (mode === "oauth") return null;
  if (mode !== "keycloak") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roles = await getKeycloakRoles();
  if (isAdmin(roles)) return null;

  const folderName = await getFolderName(folderId);
  if (!folderName) {
    return NextResponse.json({ error: "Каталог не найден" }, { status: 404 });
  }

  // When the project registry is empty the feature is off — fall back to
  // folder-wide RBAC so project-only roles don't grant a silently empty view.
  const registry = getProjectRegistry();
  const allowed =
    registry.length === 0
      ? hasFolderWideAccess(roles, folderName)
      : folderHasAnyAccess(roles, folderName);

  if (!allowed) {
    return NextResponse.json(
      { error: "Нет доступа к этому каталогу" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Filter a folder's secrets to those the user may see, based on each secret's
 * `project` label. OAuth users get everything (YC IAM handles access).
 */
export async function filterSecretsByProjectAccess(
  folderId: string,
  secrets: Secret[]
): Promise<Secret[]> {
  const mode = await getAuthMode();
  if (mode === "oauth") return secrets;
  if (mode !== "keycloak") return [];

  const roles = await getKeycloakRoles();
  if (isAdmin(roles)) return secrets;

  const folderName = await getFolderName(folderId);
  if (!folderName) return [];

  const registry = getProjectRegistry();
  // Feature off — the view gate already limited this to folder-wide access.
  if (registry.length === 0) return secrets;

  // Parse roles once, then filter all secrets against the resolver.
  const resolve = makeSecretAccessResolver(roles, folderName);
  return secrets.filter(
    (s) => resolve(normalizeProject(s.labels, registry)) !== null
  );
}

/**
 * Enforce access for creating a secret. Non-admin Keycloak users must target a
 * valid registry project (via the `project` label) and have rw on it.
 */
export async function requireCreateAccess(
  folderId: string,
  labels: Record<string, string> | undefined
): Promise<NextResponse | null> {
  const mode = await getAuthMode();
  if (mode === "oauth") return null;
  if (mode !== "keycloak") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roles = await getKeycloakRoles();
  if (isAdmin(roles)) return null;

  const folderName = await getFolderName(folderId);
  if (!folderName) {
    return NextResponse.json({ error: "Каталог не найден" }, { status: 404 });
  }

  const registry = getProjectRegistry();

  // Feature off — fall back to folder-wide rw (no project label required).
  if (registry.length === 0) {
    if (resolveSecretAccess(roles, folderName, null) !== "rw") {
      return NextResponse.json(
        { error: "Недостаточно прав. Требуется доступ на запись." },
        { status: 403 }
      );
    }
    return null;
  }

  const project = normalizeProject(labels, registry);
  if (!project) {
    return NextResponse.json(
      {
        error:
          "У секрета должна быть метка project из списка разрешённых проектов.",
      },
      { status: 400 }
    );
  }

  if (resolveSecretAccess(roles, folderName, project) !== "rw") {
    return NextResponse.json(
      { error: "Недостаточно прав для создания секрета в этом проекте." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Check access for a secret (by secretId), resolving its folder and `project`
 * label. Fails closed if the secret cannot be fetched.
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

  let secret: Secret;
  try {
    secret = await getSecret(secretId);
  } catch {
    // Fail closed: if we cannot verify access, deny rather than allow.
    return NextResponse.json(
      { error: "Не удалось проверить доступ к секрету" },
      { status: 403 }
    );
  }

  const folderName = await getFolderName(secret.folderId);
  if (!folderName) {
    return NextResponse.json({ error: "Каталог не найден" }, { status: 404 });
  }

  const project = normalizeProject(secret.labels, getProjectRegistry());
  const access = resolveSecretAccess(roles, folderName, project);

  if (!access) {
    return NextResponse.json(
      { error: "Нет доступа к этому секрету" },
      { status: 403 }
    );
  }
  if (requiredAccess === "rw" && access === "ro") {
    return NextResponse.json(
      { error: "Недостаточно прав. Требуется доступ на запись." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Access check for updating a secret. Requires rw on the secret as it currently
 * is, AND — when the update changes the `project` label — rw on the resulting
 * project too. This prevents a user from moving a secret into a project (or out
 * to "no project") they have no write access to.
 */
export async function requireUpdateAccess(
  secretId: string,
  body: UpdateSecretRequest
): Promise<NextResponse | null> {
  const mode = await getAuthMode();
  if (mode === "oauth") return null;
  if (mode !== "keycloak") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const roles = await getKeycloakRoles();
  if (isAdmin(roles)) return null;

  let secret: Secret;
  try {
    secret = await getSecret(secretId);
  } catch {
    return NextResponse.json(
      { error: "Не удалось проверить доступ к секрету" },
      { status: 403 }
    );
  }

  const folderName = await getFolderName(secret.folderId);
  if (!folderName) {
    return NextResponse.json({ error: "Каталог не найден" }, { status: 404 });
  }

  const registry = getProjectRegistry();
  const resolve = makeSecretAccessResolver(roles, folderName);

  // rw on the secret in its current project (null project = folder-wide).
  const currentProject = normalizeProject(secret.labels, registry);
  if (resolve(currentProject) !== "rw") {
    return NextResponse.json(
      { error: "Недостаточно прав. Требуется доступ на запись." },
      { status: 403 }
    );
  }

  // If the labels are being changed, require rw on the destination project too.
  const touchesLabels =
    body.labels !== undefined ||
    (body.updateMask ?? "")
      .split(",")
      .map((s) => s.trim())
      .includes("labels");

  if (touchesLabels && registry.length > 0) {
    const nextProject = normalizeProject(body.labels, registry);
    if (resolve(nextProject) !== "rw") {
      return NextResponse.json(
        { error: "Недостаточно прав для переноса секрета в этот проект." },
        { status: 403 }
      );
    }
  }
  return null;
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

  // Include folders the user can reach via folder-wide OR project-level roles.
  return folders
    .map((f) => ({ ...f, access: folderTopAccess(roles, f.name) ?? undefined }))
    .filter((f) => f.access !== undefined);
}
