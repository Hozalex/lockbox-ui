import { NextRequest, NextResponse } from "next/server";
import { listFolders } from "@/lib/yc-api";

export async function GET(request: NextRequest) {
  const cloudId = request.nextUrl.searchParams.get("cloudId");
  if (!cloudId) {
    return NextResponse.json(
      { error: "cloudId is required" },
      { status: 400 }
    );
  }

  try {
    const data = await listFolders(cloudId);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
