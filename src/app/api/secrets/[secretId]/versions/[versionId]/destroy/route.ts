import { NextRequest, NextResponse } from "next/server";
import {
  scheduleVersionDestruction,
  cancelVersionDestruction,
} from "@/lib/yc-api";
import { log } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-error";
import { validateYCResourceId } from "@/lib/validation";
import { requireSecretAccess } from "@/lib/api-rbac";

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ secretId: string; versionId: string }> }
) {
  const { secretId, versionId } = await params;

  const secretIdError = validateYCResourceId(secretId, "secretId");
  if (secretIdError) {
    return NextResponse.json({ error: secretIdError }, { status: 400 });
  }
  const versionIdError = validateYCResourceId(versionId, "versionId");
  if (versionIdError) {
    return NextResponse.json({ error: versionIdError }, { status: 400 });
  }

  // RBAC: require rw to destroy version
  const denied = await requireSecretAccess(secretId, "rw");
  if (denied) return denied;

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

  const secretIdError = validateYCResourceId(secretId, "secretId");
  if (secretIdError) {
    return NextResponse.json({ error: secretIdError }, { status: 400 });
  }
  const versionIdError = validateYCResourceId(versionId, "versionId");
  if (versionIdError) {
    return NextResponse.json({ error: versionIdError }, { status: 400 });
  }

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
