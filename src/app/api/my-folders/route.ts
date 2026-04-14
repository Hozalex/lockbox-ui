import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listClouds, listFolders, getFolder } from "@/lib/yc-api";
import { isAdmin, parseFolderPermissions } from "@/lib/rbac";
import { apiErrorResponse } from "@/lib/api-error";
import { validateYCResourceId } from "@/lib/validation";
import { cookies } from "next/headers";

interface FolderEntry {
  id: string;
  name: string;
  cloudId?: string;
  access?: string;
}

/**
 * GET /api/my-folders
 *
 * Returns a flat list of folders the current user has access to.
 *
 * Query params:
 *   verifyIds=id1,id2  — additional folder IDs to verify directly (no cloud scan needed).
 *                        Works even when SA lacks cloud-level listing permissions.
 *
 * For OAuth: all folders across all accessible clouds.
 * For Keycloak admin: all folders (SA needs resource-manager.viewer at cloud level).
 * For Keycloak per-folder: filtered by roles.
 * If cloud scan fails: only verifyIds results are returned (may be empty).
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const isOAuth = !!cookieStore.get("oauth_token")?.value;

    // Determine roles for Keycloak users
    let roles: string[] = [];
    let admin = false;
    if (!isOAuth) {
      const session = await auth();
      roles = session?.user?.roles || [];
      admin = isAdmin(roles);
    }

    // Build permitted folder name set for per-folder Keycloak users
    const permMap = new Map<string, string>(); // folderName → access
    if (!isOAuth && !admin) {
      const perms = parseFolderPermissions(roles);
      for (const p of perms) {
        permMap.set(p.folderName, p.access);
      }
    }

    const seen = new Set<string>(); // deduplicate by folder id
    const allFolders: FolderEntry[] = [];

    const addFolder = (f: FolderEntry) => {
      if (seen.has(f.id)) return;
      seen.add(f.id);
      allFolders.push(f);
    };

    // ── Path 1: cloud scan ───────────────────────────────────────────────
    try {
      const cloudsData = await listClouds();
      const clouds = cloudsData.clouds || [];

      for (const cloud of clouds) {
        const foldersData = await listFolders(cloud.id);
        for (const f of foldersData.folders || []) {
          if (isOAuth || admin) {
            addFolder({ id: f.id, name: f.name, cloudId: f.cloudId, access: admin ? "rw" : undefined });
          } else if (permMap.has(f.name)) {
            addFolder({ id: f.id, name: f.name, cloudId: f.cloudId, access: permMap.get(f.name) });
          }
        }
      }
    } catch {
      // SA lacks cloud-level permissions — fall through to verifyIds path
    }

    // ── Path 2: direct folder lookup for known IDs ───────────────────────
    // Works with only folder-level SA permissions (no cloud listing needed).
    const rawVerify = request.nextUrl.searchParams.get("verifyIds") || "";
    const verifyIds = rawVerify
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !validateYCResourceId(s, "folderId")); // only valid IDs

    for (const folderId of verifyIds) {
      if (seen.has(folderId)) continue; // already found via cloud scan
      try {
        const f = await getFolder(folderId);
        if (!f?.name) continue;

        if (isOAuth || admin) {
          addFolder({ id: f.id, name: f.name, access: admin ? "rw" : undefined });
        } else if (permMap.has(f.name)) {
          addFolder({ id: f.id, name: f.name, access: permMap.get(f.name) });
        }
        // If user doesn't have access to this folder, it's silently skipped
      } catch {
        // folder not found or SA has no permission — skip
      }
    }

    allFolders.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ folders: allFolders });
  } catch (e) {
    return apiErrorResponse(e, "GET /api/my-folders");
  }
}
