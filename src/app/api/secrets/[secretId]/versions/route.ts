import { NextRequest, NextResponse } from "next/server";
import { listVersions, addVersion } from "@/lib/yc-api";
import type { AddVersionRequest } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  const pageToken =
    request.nextUrl.searchParams.get("pageToken") || undefined;

  try {
    const data = await listVersions(secretId, 100, pageToken);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const body: AddVersionRequest = await request.json();
    const data = await addVersion(secretId, body);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
