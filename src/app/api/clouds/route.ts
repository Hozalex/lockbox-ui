import { NextResponse } from "next/server";
import { listClouds } from "@/lib/yc-api";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const data = await listClouds();
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    log.error("GET /api/clouds:", err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
