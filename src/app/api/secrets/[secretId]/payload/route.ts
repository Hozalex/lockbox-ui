import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "@/lib/yc-api";
import { apiErrorResponse } from "@/lib/api-error";
import { validateYCResourceId } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const idError = validateYCResourceId(secretId, "secretId");
  if (idError) {
    return NextResponse.json({ error: idError }, { status: 400 });
  }

  const versionId =
    request.nextUrl.searchParams.get("versionId") || undefined;

  if (versionId) {
    const versionIdError = validateYCResourceId(versionId, "versionId");
    if (versionIdError) {
      return NextResponse.json({ error: versionIdError }, { status: 400 });
    }
  }

  try {
    const data = await getPayload(secretId, versionId);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `GET /api/secrets/${secretId}/payload`);
  }
}
