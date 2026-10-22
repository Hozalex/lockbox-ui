import * as yc from "@/lib/yc-api";
import { validateYCResourceId } from "@/lib/validation";
import type { SecretsProvider } from "@/lib/providers/types";

/**
 * Yandex Cloud Lockbox. A thin adapter over the existing yc-api client — the
 * request/response shapes are the native YC ones.
 */
export const yandexProvider: SecretsProvider = {
  id: "yandex",
  capabilities: {
    tokenLogin: true,
    multipleClouds: true,
    renameSecret: true,
    deletionProtection: true,
    versionDestruction: true,
    versionDestructionCancel: true,
    deferredSecretDeletion: false,
    keyCountInList: true,
    plainTextPayload: false,
  },

  uiPolicy: () => ({ systemLabels: [] }),

  validateResourceId: (id, label) => validateYCResourceId(id, label),

  listClouds: () => yc.listClouds(),
  listFolders: (cloudId) => yc.listFolders(cloudId),
  getFolder: (folderId) => yc.getFolder(folderId),

  listSecrets: (folderId, pageToken) => yc.listSecrets(folderId, 100, pageToken),
  getSecret: (secretId) => yc.getSecret(secretId),
  createSecret: (body) => yc.createSecret(body),
  updateSecret: (secretId, body) => yc.updateSecret(secretId, body),
  deleteSecret: (secretId) => yc.deleteSecret(secretId),

  getPayload: (secretId, versionId) => yc.getPayload(secretId, versionId),
  listVersions: (secretId, pageToken) => yc.listVersions(secretId, 100, pageToken),
  addVersion: (secretId, body) => yc.addVersion(secretId, body),
  scheduleVersionDestruction: (secretId, body) =>
    yc.scheduleVersionDestruction(secretId, body),
  cancelVersionDestruction: (secretId, versionId) =>
    yc.cancelVersionDestruction(secretId, versionId),

  listKmsKeys: (folderId) => yc.listKmsKeys(folderId),
};
