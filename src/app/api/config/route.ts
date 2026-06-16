import { NextResponse } from "next/server";
import { getProjectRegistry } from "@/lib/projects";

export async function GET() {
  return NextResponse.json({
    keycloakEnabled: !!process.env.KEYCLOAK_ISSUER,
    projects: getProjectRegistry(),
  });
}
