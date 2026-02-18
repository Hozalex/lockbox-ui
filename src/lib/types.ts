// Yandex Cloud Lockbox API types

export interface Secret {
  id: string;
  folderId: string;
  createdAt: string;
  name: string;
  description: string;
  labels: Record<string, string>;
  kmsKeyId?: string;
  status: "CREATING" | "ACTIVE" | "INACTIVE";
  currentVersion: SecretVersion;
  deletionProtection: boolean;
}

export interface SecretVersion {
  id: string;
  secretId: string;
  createdAt: string;
  destroyAt?: string;
  description: string;
  status: "ACTIVE" | "SCHEDULED_FOR_DESTRUCTION" | "DESTROYED";
  payloadEntryKeys: string[];
}

export interface PayloadEntry {
  key: string;
  textValue?: string;
  binaryValue?: string;
}

export interface Payload {
  versionId: string;
  entries: PayloadEntry[];
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
  deletionProtection?: boolean;
}

export interface AddVersionRequest {
  description?: string;
  payloadEntries: PayloadEntryChange[];
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
