import { NextRequest, NextResponse } from "next/server";
import { getSecret, updateSecret, deleteSecret } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-error";
import { validateYCResourceId } from "@/lib/validation";
import {
  requireSecretAccess,
  requireUpdateAccess,
  getFolderName,
} from "@/lib/api-rbac";
import type { UpdateSecretRequest } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const idError = validateYCResourceId(secretId, "secretId");
  if (idError) {
    return NextResponse.json({ error: idError }, { status: 400 });
  }

  // RBAC: require at least ro
  const denied = await requireSecretAccess(secretId, "ro");
  if (denied) return denied;

  try {
    const data = await getSecret(secretId);
    // Attach the folder name so the client can resolve project-level access
    // against the secret's ACTUAL folder (not the currently selected one).
    const folderName = await getFolderName(data.folderId);
    return NextResponse.json({ ...data, folderName: folderName ?? undefined });
  } catch (e) {
    return apiErrorResponse(e, `GET /api/secrets/${secretId}`);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const idError = validateYCResourceId(secretId, "secretId");
  if (idError) {
    return NextResponse.json({ error: idError }, { status: 400 });
  }

  let body: UpdateSecretRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалидный JSON" }, { status: 400 });
  }

  // RBAC: require rw on the secret, and (if labels change) rw on the new project
  const denied = await requireUpdateAccess(secretId, body);
  if (denied) return denied;

  try {
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
  const idError = validateYCResourceId(secretId, "secretId");
  if (idError) {
    return NextResponse.json({ error: idError }, { status: 400 });
  }

  // RBAC: require rw to delete
  const denied = await requireSecretAccess(secretId, "rw");
  if (denied) return denied;

  try {
    const data = await deleteSecret(secretId);
    log.info(`Secret deleted: ${secretId}`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `DELETE /api/secrets/${secretId}`);
  }
}
