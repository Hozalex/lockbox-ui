export const NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
export const KEY_REGEX = /^[a-zA-Z0-9_.-]+$/;

export function validateKeys(keys: string[]): string | null {
  for (const k of keys) {
    if (!KEY_REGEX.test(k)) {
      return `Невалидный ключ «${k}»: допустимы только латиница, цифры, _, -, .`;
    }
  }
  return null;
}
