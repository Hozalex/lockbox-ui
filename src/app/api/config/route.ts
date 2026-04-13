import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    keycloakEnabled: !!process.env.KEYCLOAK_ISSUER,
  });
}
