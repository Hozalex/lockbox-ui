import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listClouds, listFolders } from "@/lib/yc-api";
import { isAdmin, parseFolderPermissions } from "@/lib/rbac";
import { apiErrorResponse } from "@/lib/api-error";
import { cookies } from "next/headers";

interface FolderEntry {
  id: string;
  name: string;
  cloudId?: string;
  access?: string;
}

/**
 * Returns a flat list of folders the current user has access to.
 *
 * For OAuth users: lists all folders across all accessible clouds (standard path).
 * For Keycloak admin: same — lists everything (SA needs resource-manager.viewer at cloud level).
 * For Keycloak per-folder users: same scan, but filtered to allowed folder names.
 *
 * If the SA lacks cloud-level listing permissions, the response will be empty.
 * The caller should handle this gracefully.
 */
export async function GET() {
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
    const permMap: Map<string, string> = new Map(); // folderName → access
    if (!isOAuth && !admin) {
      const perms = parseFolderPermissions(roles);
      for (const p of perms) {
        permMap.set(p.folderName, p.access);
      }
    }

    // Fetch all clouds and their folders
    const allFolders: FolderEntry[] = [];
    try {
      const cloudsData = await listClouds();
      const clouds = cloudsData.clouds || [];

      for (const cloud of clouds) {
        const foldersData = await listFolders(cloud.id);
        const folders = foldersData.folders || [];

        for (const f of folders) {
          if (isOAuth || admin) {
            allFolders.push({
              id: f.id,
              name: f.name,
              cloudId: f.cloudId,
              access: admin ? "rw" : undefined,
            });
          } else if (permMap.has(f.name)) {
            allFolders.push({
              id: f.id,
              name: f.name,
              cloudId: f.cloudId,
              access: permMap.get(f.name),
            });
          }
        }
      }
    } catch {
      // SA likely lacks cloud-level listing permissions — return empty list
      // The client will show an appropriate message
    }

    allFolders.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ folders: allFolders });
  } catch (e) {
    return apiErrorResponse(e, "GET /api/my-folders");
  }
}
