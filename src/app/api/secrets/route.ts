import { NextRequest, NextResponse } from "next/server";
import { listSecrets, createSecret } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import { apiErrorResponse } from "@/lib/api-error";
import { validateYCResourceId, validateSecretName } from "@/lib/validation";
import {
  requireFolderViewAccess,
  filterSecretsByProjectAccess,
  requireCreateAccess,
} from "@/lib/api-rbac";
import type { CreateSecretRequest } from "@/lib/types";

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json(
      { error: "folderId is required" },
      { status: 400 }
    );
  }

  const folderIdError = validateYCResourceId(folderId, "folderId");
  if (folderIdError) {
    return NextResponse.json({ error: folderIdError }, { status: 400 });
  }

  // RBAC: user must have some access in the folder (folder-wide or a project)
  const denied = await requireFolderViewAccess(folderId);
  if (denied) return denied;

  const pageToken =
    request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const data = await listSecrets(folderId, 100, pageToken);
    // Filter to secrets the user may see, based on each secret's project label.
    const secrets = await filterSecretsByProjectAccess(
      folderId,
      data.secrets || []
    );
    return NextResponse.json({ ...data, secrets });
  } catch (e) {
    return apiErrorResponse(e, `GET /api/secrets (folderId=${folderId})`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateSecretRequest = await request.json();
    if (!body.folderId || !body.name) {
      return NextResponse.json(
        { error: "folderId and name are required" },
        { status: 400 }
      );
    }

    const folderIdError = validateYCResourceId(body.folderId, "folderId");
    if (folderIdError) {
      return NextResponse.json({ error: folderIdError }, { status: 400 });
    }

    const nameError = validateSecretName(body.name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    // RBAC: require rw on the target project (and a valid project label)
    const denied = await requireCreateAccess(body.folderId, body.labels);
    if (denied) return denied;

    const data = await createSecret(body);
    log.info(`Secret created: ${body.name} in folder ${body.folderId}`);
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, "POST /api/secrets");
  }
}
