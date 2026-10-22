import type {
  AddVersionRequest,
  Cloud,
  CreateSecretRequest,
  Folder,
  KmsKey,
  Operation,
  Payload,
  ScheduleVersionDestructionRequest,
  Secret,
  SecretVersion,
  UpdateSecretRequest,
} from "@/lib/types";
import type { EnvMap } from "@/lib/env-map";

/**
 * Secrets-manager backends. One deployment talks to exactly one provider,
 * selected by the SECRETS_PROVIDER env variable.
 */
export type ProviderId = "yandex" | "huawei";

/**
 * What a provider can do. Exposed to the client via /api/config so the UI can
 * hide actions the backend doesn't support.
 */
export interface ProviderCapabilities {
  /** Users can sign in by pasting a provider token (YC OAuth). */
  tokenLogin: boolean;
  /** More than one top-level scope ("cloud") to choose from. */
  multipleClouds: boolean;
  /** Secrets can be renamed after creation. */
  renameSecret: boolean;
  /** Secrets carry a deletion-protection flag. */
  deletionProtection: boolean;
  /** Individual versions can be scheduled for destruction. */
  versionDestruction: boolean;
  /** A scheduled version destruction can be cancelled. */
  versionDestructionCancel: boolean;
  /** Deleting a secret is deferred and can be cancelled (restored). */
  deferredSecretDeletion: boolean;
  /** Secret lists include each secret's key count (without reading values). */
  keyCountInList: boolean;
  /** Secrets can hold a plain string instead of key/value pairs. */
  plainTextPayload: boolean;
}

/** Provider rules the UI needs to offer the right options and wording. */
export interface ProviderUiPolicy {
  /** Days a deleted secret stays restorable, per folder (deferred deletion). */
  secretDeletionDays?: EnvMap<number>;
  /** Days until a "deleted" version expires, per folder (fixed by policy). */
  versionRetentionDays?: EnvMap<number>;
  /** New names get a "<folder>-<project>-" prefix, except in these folders. */
  namePrefix?: { exemptFolders: string[] };
  /** Labels managed by the provider that users can't set. */
  systemLabels: string[];
}

/**
 * Provider-neutral secrets backend. Request/response shapes follow our own
 * domain types (originally modelled on YC Lockbox) so the API routes and the
 * UI stay provider-agnostic.
 *
 * "Cloud" and "folder" are our scope terms: for YC they are clouds and
 * folders; other providers map their own grouping onto them.
 */
export interface SecretsProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  /** Rules for the UI (served by /api/config). */
  uiPolicy(): ProviderUiPolicy;

  /** Validates an ID of the given kind; returns an error message or null. */
  validateResourceId(id: string, label: string): string | null;

  // Scopes
  listClouds(): Promise<{ clouds?: Cloud[]; nextPageToken?: string }>;
  listFolders(cloudId: string): Promise<{ folders?: Folder[]; nextPageToken?: string }>;
  getFolder(folderId: string): Promise<Folder>;

  // Secrets
  listSecrets(
    folderId: string,
    pageToken?: string
  ): Promise<{ secrets?: Secret[]; nextPageToken?: string }>;
  getSecret(secretId: string): Promise<Secret>;
  createSecret(body: CreateSecretRequest): Promise<Operation>;
  updateSecret(secretId: string, body: UpdateSecretRequest): Promise<Operation>;
  deleteSecret(secretId: string): Promise<Operation>;
  /** Cancels a scheduled deletion. Only when capabilities.deferredSecretDeletion. */
  restoreSecret?(secretId: string): Promise<Operation>;

  // Payload & versions
  getPayload(secretId: string, versionId?: string): Promise<Payload>;
  listVersions(
    secretId: string,
    pageToken?: string
  ): Promise<{ versions?: SecretVersion[]; nextPageToken?: string }>;
  addVersion(secretId: string, body: AddVersionRequest): Promise<Operation>;
  scheduleVersionDestruction(
    secretId: string,
    body: ScheduleVersionDestructionRequest
  ): Promise<Operation>;
  cancelVersionDestruction(secretId: string, versionId: string): Promise<Operation>;

  // KMS
  listKmsKeys(folderId: string): Promise<{ keys?: KmsKey[]; nextPageToken?: string }>;
}

/**
 * Error from a provider call. API routes turn `status` into the HTTP status
 * (see apiErrorResponse), so providers should use meaningful codes:
 * 400 bad input / unsupported, 404 not found, 409 conflict.
 */
export class ProviderApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ProviderApiError";
  }
}
