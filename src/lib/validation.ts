export const NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
export const KEY_REGEX = /^[a-zA-Z0-9_.-]+$/;

// Yandex Cloud resource IDs: lowercase alphanumeric, optionally with hyphens in the middle
// 1–50 chars, starts and ends with alphanumeric, e.g. "example-resource-id"
export const YC_RESOURCE_ID_REGEX = /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/;

// OAuth token: starts with "y" followed by alphanumeric/underscore/hyphen chars
// Typical YC OAuth tokens are under 1000 characters.
const OAUTH_TOKEN_MAX_LENGTH = 1000;
const OAUTH_TOKEN_REGEX = /^y[0-9]_[A-Za-z0-9_-]{10,}/;

export function validateYCResourceId(id: string, label = "id"): string | null {
  if (!id || typeof id !== "string") return `${label} is required`;
  if (!YC_RESOURCE_ID_REGEX.test(id))
    return `Некорректный формат ${label}`;
  return null;
}

export function validateOAuthToken(token: string): string | null {
  if (!token || typeof token !== "string") return "token is required";
  if (token.length > OAUTH_TOKEN_MAX_LENGTH)
    return "token exceeds maximum allowed length";
  if (!OAUTH_TOKEN_REGEX.test(token))
    return "Некорректный формат OAuth-токена";
  return null;
}

export function validateSecretName(name: string): string | null {
  if (!name || typeof name !== "string") return "name is required";
  if (!NAME_REGEX.test(name))
    return "Некорректное имя секрета: допустимы только латиница, цифры, _, -, .";
  return null;
}

export function validateKeys(keys: string[]): string | null {
  for (const k of keys) {
    if (!KEY_REGEX.test(k)) {
      return `Невалидный ключ «${k}»: допустимы только латиница, цифры, _, -, .`;
    }
  }
  return null;
}
