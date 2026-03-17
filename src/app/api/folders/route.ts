import { NextRequest, NextResponse } from "next/server";
import { listFolders } from "@/lib/yc-api";
import { apiErrorResponse } from "@/lib/api-error";
import { validateYCResourceId } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const cloudId = request.nextUrl.searchParams.get("cloudId");
  if (!cloudId) {
    return NextResponse.json(
      { error: "cloudId is required" },
      { status: 400 }
    );
  }

  const cloudIdError = validateYCResourceId(cloudId, "cloudId");
  if (cloudIdError) {
    return NextResponse.json({ error: cloudIdError }, { status: 400 });
  }

  try {
    const data = await listFolders(cloudId);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `GET /api/folders (cloudId=${cloudId})`);
  }
}
