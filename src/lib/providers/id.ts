import type { ProviderId } from "@/lib/providers/types";

/**
 * Which secrets manager this deployment talks to, from SECRETS_PROVIDER
 * (`yandex` | `huawei`, default `yandex`). Server-only, dependency-free so the
 * proxy can import it.
 */
export function getProviderId(): ProviderId {
  const raw = (process.env.SECRETS_PROVIDER || "yandex").trim().toLowerCase();
  if (raw !== "yandex" && raw !== "huawei") {
    throw new Error(
      `Unknown SECRETS_PROVIDER "${raw}" — expected "yandex" or "huawei"`
    );
  }
  return raw;
}

/** Token login is retired; all deployments require Keycloak. */
export function tokenLoginEnabled(): boolean {
  return false;
}
