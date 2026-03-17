import { NextResponse } from "next/server";
import { listClouds } from "@/lib/yc-api";
import { apiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const data = await listClouds();
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, "GET /api/clouds");
  }
}
