import { handlers } from "@/auth";

const isEnabled = !!process.env.KEYCLOAK_ISSUER;

const notConfigured = () =>
  new Response("Keycloak not configured", { status: 404 });

export const GET = isEnabled ? handlers.GET : notConfigured;
export const POST = isEnabled ? handlers.POST : notConfigured;
