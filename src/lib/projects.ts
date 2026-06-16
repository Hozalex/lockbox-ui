/**
 * Server-side project registry.
 *
 * The set of valid project names is configured via the LOCKBOX_PROJECTS env var
 * (comma-separated, e.g. `LOCKBOX_PROJECTS=sample-app,billing`). Project names
 * are global (not scoped per folder/environment) and compared lowercased — a
 * project that exists in `dev` is the same project name in `prod`.
 *
 * A secret's `project` label is only honored when it matches an entry here;
 * anything else is treated as "no project" for access-control purposes.
 */
export function getProjectRegistry(): string[] {
  return (process.env.LOCKBOX_PROJECTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
