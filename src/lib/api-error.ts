import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getSecretsProvider } from "@/lib/providers";

export function apiErrorResponse(e: unknown, context: string): NextResponse {
  const err = e as { status?: number; message?: string };
  log.error(`${context}:`, err.message);
  return NextResponse.json(
    { error: err.message },
    { status: err.status || 500 }
  );
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

export function validateResourceIdResponse(
  id: string,
  label: string
): NextResponse | null {
  // ID formats differ per provider (YC IDs vs. Huawei secret names).
  const error = getSecretsProvider().validateResourceId(id, label);
  return error ? badRequest(error) : null;
}

export async function readJsonBody<T>(
  request: NextRequest
): Promise<{ data: T } | { response: NextResponse }> {
  try {
    return { data: (await request.json()) as T };
  } catch {
    return { response: badRequest("Невалидный JSON") };
  }
}
