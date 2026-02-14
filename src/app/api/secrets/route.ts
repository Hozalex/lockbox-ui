import { NextRequest, NextResponse } from "next/server";
import { listSecrets, createSecret } from "@/lib/yc-api";
import { log } from "@/lib/logger";
import type { CreateSecretRequest } from "@/lib/types";

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json(
      { error: "folderId is required" },
      { status: 400 }
    );
  }

  const pageToken =
    request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const data = await listSecrets(folderId, 100, pageToken);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error(`GET /api/secrets (folderId=${folderId}):`, err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
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
    const data = await createSecret(body);
    log.info(`Secret created: ${body.name} in folder ${body.folderId}`);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error("POST /api/secrets:", err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
