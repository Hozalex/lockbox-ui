import type { ProviderId, SecretsProvider } from "@/lib/providers/types";
import { getProviderId } from "@/lib/providers/id";
import { yandexProvider } from "@/lib/providers/yandex";
import { huaweiProvider } from "@/lib/providers/huawei";

export type { ProviderId, ProviderCapabilities, SecretsProvider } from "@/lib/providers/types";
export { getProviderId, tokenLoginEnabled } from "@/lib/providers/id";

const PROVIDERS: Record<ProviderId, SecretsProvider> = {
  yandex: yandexProvider,
  huawei: huaweiProvider,
};

/** The active secrets provider. Throws on misconfiguration. */
export function getSecretsProvider(): SecretsProvider {
  const id = getProviderId();
  return PROVIDERS[id];
}
