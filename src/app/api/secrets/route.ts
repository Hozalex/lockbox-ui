import { NextRequest, NextResponse } from "next/server";
import { getSecretsProvider } from "@/lib/providers";
import { log } from "@/lib/logger";
import {
  apiErrorResponse,
  badRequest,
  readJsonBody,
  validateResourceIdResponse,
} from "@/lib/api-error";
import { validateSecretName } from "@/lib/validation";
import {
  requireFolderViewAccess,
  filterSecretsByProjectAccess,
  requireCreateAccess,
} from "@/lib/api-rbac";
import type { CreateSecretRequest } from "@/lib/types";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return badRequest("folderId is required");
  }

  const folderIdError = validateResourceIdResponse(folderId, "folderId");
  if (folderIdError) return folderIdError;

  // RBAC: user must have some access in the folder (folder-wide or a project)
  const denied = await requireFolderViewAccess(folderId);
  if (denied) return denied;
  const authorized = performance.now();

  const pageToken =
    request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const data = await getSecretsProvider().listSecrets(folderId, pageToken);
    const listed = performance.now();
    // Filter to secrets the user may see, based on each secret's project label.
    const secrets = await filterSecretsByProjectAccess(
      folderId,
      data.secrets || []
    );
    const filtered = performance.now();
    return NextResponse.json({ ...data, secrets }, {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `access;dur=${(authorized - started).toFixed(1)}, provider;dur=${(listed - authorized).toFixed(1)}, filter;dur=${(filtered - listed).toFixed(1)}`,
      },
    });
  } catch (e) {
    return apiErrorResponse(e, `GET /api/secrets (folderId=${folderId})`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody<CreateSecretRequest>(request);
    if ("response" in parsed) return parsed.response;
    const { data: body } = parsed;

    if (!body.folderId || !body.name) {
      return badRequest("folderId and name are required");
    }

    const folderIdError = validateResourceIdResponse(body.folderId, "folderId");
    if (folderIdError) return folderIdError;

    const nameError = validateSecretName(body.name);
    if (nameError) {
      return badRequest(nameError);
    }

    // RBAC: require rw on the target project (and a valid project label)
    const denied = await requireCreateAccess(body.folderId, body.labels);
    if (denied) return denied;

    const data = await getSecretsProvider().createSecret(body);
    log.info(`Secret created: ${body.name} in folder ${body.folderId}`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, "POST /api/secrets");
  }
}
