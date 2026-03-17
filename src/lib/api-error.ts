import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

export function apiErrorResponse(e: unknown, context: string): NextResponse {
  const err = e as { status?: number; message?: string };
  log.error(`${context}:`, err.message);
  return NextResponse.json(
    { error: err.message },
    { status: err.status || 500 }
  );
}
