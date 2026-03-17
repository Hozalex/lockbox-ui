import { NextRequest, NextResponse } from "next/server";
import { listKmsKeys } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import { validateYCResourceId } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json(
      { error: "folderId is required" },
      { status: 400 }
    );
  }

  const folderIdError = validateYCResourceId(folderId, "folderId");
  if (folderIdError) {
    return NextResponse.json({ error: folderIdError }, { status: 400 });
  }

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
