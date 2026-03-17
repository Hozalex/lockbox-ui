import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "@/lib/yc-api";
import { apiErrorResponse } from "@/lib/api-error";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const versionId =
    request.nextUrl.searchParams.get("versionId") || undefined;

  try {
    const data = await getPayload(secretId, versionId);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `GET /api/secrets/${secretId}/payload`);
  }
}
