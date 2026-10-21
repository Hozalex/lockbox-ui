import { NextResponse } from "next/server";
import { getProjectRegistry } from "@/lib/projects";
import { getSecretsProvider } from "@/lib/providers";

export async function GET() {
  const provider = getSecretsProvider();
  return NextResponse.json({
    keycloakEnabled: !!process.env.KEYCLOAK_ISSUER,
    projects: getProjectRegistry(),
    provider: provider.id,
    capabilities: provider.capabilities,
    policy: provider.uiPolicy(),
  });
}
