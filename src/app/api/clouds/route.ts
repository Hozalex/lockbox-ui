import { NextResponse } from "next/server";
import { listClouds } from "@/lib/yc-api";

export async function GET() {
  try {
    const data = await listClouds();
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
