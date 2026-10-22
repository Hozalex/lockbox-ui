/**
 * Client-side view of the active secrets provider (from /api/config) and the
 * UI helpers built on it. Client-safe.
 */
import { envMapGet, type EnvMap } from "@/lib/env-map";
import type { ProviderCapabilities, ProviderUiPolicy } from "@/lib/providers/types";

export type { ProviderCapabilities, ProviderUiPolicy };

/** Until /api/config loads, assume the most permissive (YC) behaviour except token login. */
export const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  tokenLogin: false,
  multipleClouds: true,
  renameSecret: true,
  deletionProtection: true,
  versionDestruction: true,
  versionDestructionCancel: true,
  deferredSecretDeletion: false,
  keyCountInList: true,
  plainTextPayload: false,
};

export const DEFAULT_POLICY: ProviderUiPolicy = { systemLabels: [] };

function days(map: EnvMap<number> | undefined, folder: string | null | undefined) {
  return map && folder ? envMapGet(map, folder) : undefined;
}

/** Days a deleted secret in this folder stays restorable (deferred deletion). */
export const secretDeletionDays = (p: ProviderUiPolicy, folder?: string | null) =>
  days(p.secretDeletionDays, folder);

/** Days until a "deleted" version in this folder expires (fixed by policy). */
export const versionRetentionDays = (p: ProviderUiPolicy, folder?: string | null) =>
  days(p.versionRetentionDays, folder);

/**
 * Prefix new secret names must carry in this folder, or "" when names are
 * free-form (no rule, or an exempt folder such as infra).
 */
export function namePrefixFor(
  p: ProviderUiPolicy,
  folder: string | null | undefined,
  project?: string | null
): string {
  if (!p.namePrefix || !folder) return "";
  if (p.namePrefix.exemptFolders.includes(folder.toLowerCase())) return "";
  return project ? `${folder}-${project}-` : `${folder}-`;
}

/** Labels without the ones the provider manages itself. */
export function withoutSystemLabels<T extends { key: string }>(
  p: ProviderUiPolicy,
  labels: T[]
): T[] {
  return labels.filter((l) => !p.systemLabels.includes(l.key.trim()));
}
