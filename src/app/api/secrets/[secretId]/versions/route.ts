import { NextRequest, NextResponse } from "next/server";
import { listVersions, addVersion } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-error";
import { validateYCResourceId } from "@/lib/validation";
import { requireSecretAccess } from "@/lib/api-rbac";
import type { AddVersionRequest } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const idError = validateYCResourceId(secretId, "secretId");
  if (idError) {
    return NextResponse.json({ error: idError }, { status: 400 });
  }

  // RBAC: require at least ro to list versions
  const denied = await requireSecretAccess(secretId, "ro");
  if (denied) return denied;

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
  const idError = validateYCResourceId(secretId, "secretId");
  if (idError) {
    return NextResponse.json({ error: idError }, { status: 400 });
  }

  // RBAC: require rw to add version
  const denied = await requireSecretAccess(secretId, "rw");
  if (denied) return denied;

  try {
    const body: AddVersionRequest = await request.json();
    const data = await addVersion(secretId, body);
    log.info(`Version added to secret ${secretId}`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `POST /api/secrets/${secretId}/versions`);
  }
}
