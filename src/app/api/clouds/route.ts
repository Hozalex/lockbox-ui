import { NextResponse } from "next/server";
import { getSecretsProvider } from "@/lib/providers";
import { apiErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const data = await getSecretsProvider().listClouds();
    return NextResponse.json(data);
  } catch (e) {
    return apiErrorResponse(e, "GET /api/clouds");
  }
}
