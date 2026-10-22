// Yandex Cloud Lockbox API types

export interface Secret {
  id: string;
  folderId: string;
  /** Folder name, attached by GET /api/secrets/[secretId] for client RBAC. */
  folderName?: string;
  createdAt: string;
  name: string;
  description: string;
  labels: Record<string, string>;
  kmsKeyId?: string;
  /** PENDING_DELETION: deletion is scheduled and can still be cancelled. */
  status: "CREATING" | "ACTIVE" | "INACTIVE" | "PENDING_DELETION";
  currentVersion: SecretVersion;
  deletionProtection: boolean;
  /** When a scheduled deletion takes effect (providers with deferred deletion). */
  deletionScheduledAt?: string;
}

export interface SecretVersion {
  id: string;
  secretId: string;
  createdAt: string;
  destroyAt?: string;
  description: string;
  /** EXPIRED: the version's validity period ended but it still exists. */
  status: "ACTIVE" | "SCHEDULED_FOR_DESTRUCTION" | "DESTROYED" | "EXPIRED";
  payloadEntryKeys: string[];
  /** Provider version stages/labels (e.g. Huawei SYSCURRENT, SYSPREVIOUS). */
  stages?: string[];
}

export interface PayloadEntry {
  key: string;
  textValue?: string;
  binaryValue?: string;
}

export interface Payload {
  versionId: string;
  entries: PayloadEntry[];
  /** Set when the version holds one plain string instead of key/value pairs. */
  plainText?: string;
}

export interface PayloadEntryChange {
  key: string;
  textValue?: string;
  binaryValue?: string;
}

export interface CloneSecretData {
  name: string;
  description: string;
  kmsKeyId?: string;
  deletionProtection: boolean;
  labels: Record<string, string>;
  entries: PayloadEntry[];
  plainText?: string;
  sourceFolderId: string;
}

export interface CreateSecretRequest {
  folderId: string;
  name: string;
  description?: string;
  labels?: Record<string, string>;
  kmsKeyId?: string;
  versionDescription?: string;
  versionPayloadEntries?: PayloadEntryChange[];
  /** Plain-text payload instead of key/value entries (needs capabilities.plainTextPayload). */
  versionPlainText?: string;
  deletionProtection?: boolean;
}

export interface AddVersionRequest {
  description?: string;
  payloadEntries: PayloadEntryChange[];
  /** Replaces the whole payload with a plain string (needs capabilities.plainTextPayload). */
  plainText?: string;
  baseVersionId?: string;
}

export interface ScheduleVersionDestructionRequest {
  versionId: string;
  pendingPeriod?: string; // Duration like "604800s" (7 days)
}

export interface UpdateSecretRequest {
  updateMask: string;
  name?: string;
  description?: string;
  labels?: Record<string, string>;
  deletionProtection?: boolean;
}

// Resource Manager types
export interface Cloud {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  cloudId: string;
  name: string;
  description: string;
  createdAt: string;
  status: string;
}

// KMS
export interface KmsKey {
  id: string;
  name: string;
  description: string;
  status: string;
  defaultAlgorithm: string;
  /** The key to preselect for new secrets in this folder. */
  isDefault?: boolean;
}

// API response wrappers
export interface ListResponse<T> {
  items: T[];
  nextPageToken?: string;
}

export interface Operation {
  id: string;
  description: string;
  createdAt: string;
  done: boolean;
  metadata?: Record<string, string>;
  error?: { code: number; message: string };
  response?: Record<string, unknown>;
}
