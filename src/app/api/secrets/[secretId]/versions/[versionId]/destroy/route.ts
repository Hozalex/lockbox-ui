import { NextRequest, NextResponse } from "next/server";
import {
  scheduleVersionDestruction,
  cancelVersionDestruction,
} from "@/lib/yc-api";
import { log } from "@/lib/logger";
import {
  apiErrorResponse,
  readJsonBody,
  validateResourceIdResponse,
} from "@/lib/api-error";
import { requireSecretAccess } from "@/lib/api-rbac";

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ secretId: string; versionId: string }> }
) {
  const { secretId, versionId } = await params;

  const secretIdError = validateResourceIdResponse(secretId, "secretId");
  if (secretIdError) return secretIdError;
  const versionIdError = validateResourceIdResponse(versionId, "versionId");
  if (versionIdError) return versionIdError;

  // RBAC: require rw to destroy version
  const denied = await requireSecretAccess(secretId, "rw");
  if (denied) return denied;

  try {
    const parsed = await readJsonBody<{ pendingPeriod?: string }>(request);
    if ("response" in parsed) return parsed.response;
    const { data: body } = parsed;
    const pendingPeriod = body.pendingPeriod as string | undefined;

    const data = await scheduleVersionDestruction(secretId, {
      versionId,
      pendingPeriod,
    });
    log.info(`Version ${versionId} of secret ${secretId} scheduled for destruction`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `POST /api/secrets/${secretId}/versions/${versionId}/destroy`);
  }
}

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ secretId: string; versionId: string }> }
) {
  const { secretId, versionId } = await params;

  const secretIdError = validateResourceIdResponse(secretId, "secretId");
  if (secretIdError) return secretIdError;
  const versionIdError = validateResourceIdResponse(versionId, "versionId");
  if (versionIdError) return versionIdError;

  // RBAC: require rw to cancel destruction
  const denied = await requireSecretAccess(secretId, "rw");
  if (denied) return denied;

  try {
    const data = await cancelVersionDestruction(secretId, versionId);
    log.info(`Version ${versionId} of secret ${secretId} destruction cancelled`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `DELETE /api/secrets/${secretId}/versions/${versionId}/destroy`);
  }
}
