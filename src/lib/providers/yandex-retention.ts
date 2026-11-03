import * as yc from "@/lib/yc-api";
import { getEnvKind } from "@/lib/env-accent";
import { log } from "@/lib/logger";
import type { AddVersionRequest, SecretVersion } from "@/lib/types";

export function retentionCandidates(versions: SecretVersion[], currentId: string, keep: number) {
  const active = versions.filter((v) => v.status === "ACTIVE")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  // Always protect the actual current version, including after a rollback.
  const protectedIds = new Set([currentId]);
  for (const version of active) {
    if (protectedIds.size >= keep) break;
    protectedIds.add(version.id);
  }
  return active.filter((v) => !protectedIds.has(v.id));
}

export async function addVersionWithRetention(secretId: string, body: AddVersionRequest) {
  // Resolve the policy before writing, so a missing folder cannot turn into an
  // unexpectedly destructive non-production policy.
  const before = await yc.getSecret(secretId);
  const folder = await yc.getFolder(before.folderId);
  const prod = getEnvKind(folder.name) === "prod";
  const operation = await yc.addVersion(secretId, body);
  const completed = await yc.waitOperation(operation);
  try {
    const versions: SecretVersion[] = [];
    let token: string | undefined;
    do {
      const page = await yc.listVersions(secretId, 100, token);
      versions.push(...(page.versions ?? []));
      token = page.nextPageToken;
    } while (token);
    const secret = await yc.getSecret(secretId);
    const newId = completed.response?.id;
    if (typeof newId !== "string" || !versions.some((v) => v.id === newId)) {
      throw new Error("Новая версия ещё не появилась в списке; очистка пропущена");
    }
    for (const version of retentionCandidates(versions, secret.currentVersion.id, prod ? 2 : 1)) {
      await yc.waitOperation(await yc.scheduleVersionDestruction(secretId, {
        versionId: version.id,
        pendingPeriod: `${(prod ? 30 : 5) * 86400}s`,
      }));
    }
    return completed;
  } catch (error) {
    // Creation succeeded: don't report a failed POST and invite a duplicate write.
    const warning = `Версия создана, но автоматическая очистка не завершена: ${(error as Error).message}`;
    log.warn(warning);
    return { ...completed, warnings: [warning] };
  }
}
