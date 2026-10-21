import { NextRequest, NextResponse } from "next/server";
import { getSecretsProvider } from "@/lib/providers";
import {
  apiErrorResponse,
  validateResourceIdResponse,
} from "@/lib/api-error";
import { requireSecretAccess } from "@/lib/api-rbac";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const idError = validateResourceIdResponse(secretId, "secretId");
  if (idError) return idError;

  // RBAC: require at least ro to read payload
  const denied = await requireSecretAccess(secretId, "ro");
  if (denied) return denied;

  const versionId =
    request.nextUrl.searchParams.get("versionId") || undefined;

  if (versionId) {
    const versionIdError = validateResourceIdResponse(versionId, "versionId");
    if (versionIdError) return versionIdError;
  }

  try {
    const data = await getSecretsProvider().getPayload(secretId, versionId);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `GET /api/secrets/${secretId}/payload`);
  }
}
