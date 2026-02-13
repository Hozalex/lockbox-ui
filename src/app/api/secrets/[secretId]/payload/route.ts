import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "@/lib/yc-api";

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
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
