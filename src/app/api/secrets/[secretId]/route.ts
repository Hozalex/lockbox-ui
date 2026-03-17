import { NextRequest, NextResponse } from "next/server";
import { getSecret, updateSecret, deleteSecret } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-error";
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
    return apiErrorResponse(e, `GET /api/secrets/${secretId}`);
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
    return apiErrorResponse(e, `PATCH /api/secrets/${secretId}`);
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
    return apiErrorResponse(e, `DELETE /api/secrets/${secretId}`);
  }
}
