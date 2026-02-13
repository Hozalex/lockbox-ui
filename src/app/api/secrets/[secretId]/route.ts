import { NextRequest, NextResponse } from "next/server";
import { getSecret, updateSecret, deleteSecret } from "@/lib/yc-api";
import type { UpdateSecretRequest } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const data = await getSecret(secretId);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const body: UpdateSecretRequest = await request.json();
    const data = await updateSecret(secretId, body);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ secretId: string }> }
) {
  const { secretId } = await params;
  try {
    const data = await deleteSecret(secretId);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
