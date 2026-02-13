import { NextRequest, NextResponse } from "next/server";
import { listKmsKeys } from "@/lib/yc-api";

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json(
      { error: "folderId is required" },
      { status: 400 }
    );
  }

  try {
    const data = await listKmsKeys(folderId);
    return NextResponse.json({ keys: data.keys || [] });
  } catch (e) {
    // If user has no KMS access — return empty list with error message,
    // so UI can fall back to manual input
    const message = (e as Error).message || "Unknown error";
    return NextResponse.json({ keys: [], error: message });
  }
}
