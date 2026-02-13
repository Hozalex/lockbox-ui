import { NextRequest, NextResponse } from "next/server";
import {
  scheduleVersionDestruction,
  cancelVersionDestruction,
} from "@/lib/yc-api";

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
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
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
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
