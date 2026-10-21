import { NextRequest, NextResponse } from "next/server";
import { getSecretsProvider } from "@/lib/providers";
import { log } from "@/lib/logger";
import { apiErrorResponse, badRequest, validateResourceIdResponse } from "@/lib/api-error";
import { requireSecretAccess } from "@/lib/api-rbac";

/** Cancels a scheduled secret deletion (providers with deferred deletion only). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const idError = validateResourceIdResponse(secretId, "secretId");
  if (idError) return idError;

  const provider = getSecretsProvider();
  if (!provider.capabilities.deferredSecretDeletion || !provider.restoreSecret) {
    return badRequest("Восстановление удалённых секретов не поддерживается");
  }

  // RBAC: same as deleting — rw on the secret's project
  const denied = await requireSecretAccess(secretId, "rw");
  if (denied) return denied;

  try {
    const data = await provider.restoreSecret(secretId);
    log.info(`Secret restored: ${secretId}`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, `POST /api/secrets/${secretId}/restore`);
  }
}
