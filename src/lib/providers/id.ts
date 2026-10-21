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

/**
 * Whether users may sign in by pasting a provider token (YC OAuth).
 *
 * Security: token sessions skip lbox RBAC because YC enforces access with the
 * user's own token. Providers without token login (Huawei) call the cloud with
 * the APP's credentials, so a token-session cookie must never grant access
 * there. Must agree with each provider's capabilities.tokenLogin (tested).
 */
export function tokenLoginEnabled(): boolean {
  return getProviderId() === "yandex";
}
