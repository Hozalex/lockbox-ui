import { NextRequest, NextResponse } from "next/server";
import { listFolders } from "@/lib/yc-api";
import {
  apiErrorResponse,
  badRequest,
  validateResourceIdResponse,
} from "@/lib/api-error";
import { filterFoldersByAccess } from "@/lib/api-rbac";

export async function GET(request: NextRequest) {
  const cloudId = request.nextUrl.searchParams.get("cloudId");
  if (!cloudId) {
    return badRequest("cloudId is required");
  }

  const cloudIdError = validateResourceIdResponse(cloudId, "cloudId");
  if (cloudIdError) return cloudIdError;

  try {
    const data = await listFolders(cloudId);
    const folders = data.folders || [];

    // Keycloak users: filter to only folders they have access to (by role).
    // OAuth users: return everything — YC IAM handles access.
    const filtered = await filterFoldersByAccess(folders);

    return NextResponse.json({ ...data, folders: filtered });
  } catch (e) {
    return apiErrorResponse(e, `GET /api/folders (cloudId=${cloudId})`);
  }
}
