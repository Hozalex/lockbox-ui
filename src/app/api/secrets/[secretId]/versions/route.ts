import { NextRequest, NextResponse } from "next/server";
import { listVersions, addVersion } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-error";
import type { AddVersionRequest } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const pageToken =
    request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const data = await listVersions(secretId, 100, pageToken);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `GET /api/secrets/${secretId}/versions`);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const body: AddVersionRequest = await request.json();
    const data = await addVersion(secretId, body);
    log.info(`Version added to secret ${secretId}`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `POST /api/secrets/${secretId}/versions`);
  }
}
