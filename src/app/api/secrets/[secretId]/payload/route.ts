import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "@/lib/yc-api";
import { log } from "@/lib/logger";

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
    const err = e as { status?: number; message?: string };
    log.error(`GET /api/secrets/${secretId}/payload:`, err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
