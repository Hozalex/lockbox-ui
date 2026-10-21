/**
 * Per-environment value maps, e.g. "prod:30,*:7" ("*" = every other env).
 * Client-safe: shared by provider config (server) and the UI.
 */
export type EnvMap<T> = { byEnv: Record<string, T>; fallback: T };

export function parseEnvMap<T>(
  raw: string | undefined,
  fallback: T,
  parse: (v: string) => T
): EnvMap<T> {
  const byEnv: Record<string, T> = {};
  let dflt = fallback;
  for (const part of (raw || "").split(",")) {
    const [k, ...rest] = part.split(":");
    const key = k?.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (!key || !val) continue;
    if (key === "*") dflt = parse(val);
    else byEnv[key] = parse(val);
  }
  return { byEnv, fallback: dflt };
}

export function envMapGet<T>(map: EnvMap<T>, env: string): T {
  return map.byEnv[env.toLowerCase()] ?? map.fallback;
}
