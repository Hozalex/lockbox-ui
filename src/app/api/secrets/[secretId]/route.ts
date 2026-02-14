import { NextRequest, NextResponse } from "next/server";
import { getSecret, updateSecret, deleteSecret } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import type { UpdateSecretRequest } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const data = await getSecret(secretId);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error(`GET /api/secrets/${secretId}:`, err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const body: UpdateSecretRequest = await request.json();
    const data = await updateSecret(secretId, body);
    log.info(`Secret updated: ${secretId}`);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error(`PATCH /api/secrets/${secretId}:`, err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const data = await deleteSecret(secretId);
    log.info(`Secret deleted: ${secretId}`);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error(`DELETE /api/secrets/${secretId}:`, err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
