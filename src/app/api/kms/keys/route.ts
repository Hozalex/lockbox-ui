import { NextRequest, NextResponse } from "next/server";
import { listKmsKeys } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import {
  badRequest,
  validateResourceIdResponse,
} from "@/lib/api-error";
import { requireFolderViewAccess } from "@/lib/api-rbac";

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return badRequest("folderId is required");
  }

  const folderIdError = validateResourceIdResponse(folderId, "folderId");
  if (folderIdError) return folderIdError;

  // RBAC: require some access in the folder to list KMS keys
  const denied = await requireFolderViewAccess(folderId);
  if (denied) return denied;

  try {
    const data = await listKmsKeys(folderId);
    return NextResponse.json({ keys: data.keys || [] });
  } catch (e) {
    // If user has no KMS access — return empty list with error message,
    // so UI can fall back to manual input
    const message = (e as Error).message || "Unknown error";
    log.warn(`GET /api/kms/keys (folderId=${folderId}):`, message);
    return NextResponse.json({ keys: [], error: message });
  }
}
