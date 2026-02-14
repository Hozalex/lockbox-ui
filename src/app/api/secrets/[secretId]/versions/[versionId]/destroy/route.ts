import { NextRequest, NextResponse } from "next/server";
import {
  scheduleVersionDestruction,
  cancelVersionDestruction,
} from "@/lib/yc-api";
import { log } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ secretId: string; versionId: string }> }
) {
  const { secretId, versionId } = await params;

  try {
    const body = await request.json();
    const pendingPeriod = body.pendingPeriod as string | undefined;

    const data = await scheduleVersionDestruction(secretId, {
      versionId,
      pendingPeriod,
    });
    log.info(`Version ${versionId} of secret ${secretId} scheduled for destruction`);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error(`POST /api/secrets/${secretId}/versions/${versionId}/destroy:`, err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ secretId: string; versionId: string }> }
) {
  const { secretId, versionId } = await params;

  try {
    const data = await cancelVersionDestruction(secretId, versionId);
    log.info(`Version ${versionId} of secret ${secretId} destruction cancelled`);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error(`DELETE /api/secrets/${secretId}/versions/${versionId}/destroy:`, err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
