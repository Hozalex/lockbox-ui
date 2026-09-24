/**
 * Environment colour marker.
 *
 * The divider under the header is coloured by the selected folder so it's
 * immediately obvious which environment you're working in: production is red,
 * staging yellow, everything else green. While no folder is selected it stays
 * neutral.
 *
 * Folder names come from YC (e.g. `dev`, `stage`, `prod`).
 */

export type EnvKind = "prod" | "stage" | "nonprod" | "unknown";

/** A folder counts as production when its name contains "prod". */
export const PROD_FOLDER_RE = /prod/i;
/** ...and as staging when it contains "stag" (stage, staging). */
export const STAGE_FOLDER_RE = /stag/i;

export function getEnvKind(folderName: string | null | undefined): EnvKind {
  if (!folderName?.trim()) return "unknown";
  // Prod wins if a name somehow matches both.
  if (PROD_FOLDER_RE.test(folderName)) return "prod";
  if (STAGE_FOLDER_RE.test(folderName)) return "stage";
  return "nonprod";
}

/** Divider colour under the header, per environment. */
export const ENV_BORDER_CLASS: Record<EnvKind, string> = {
  prod: "border-red-500",
  stage: "border-yellow-500",
  nonprod: "border-green-500",
  unknown: "border-border",
};

/** Human-readable hint shown on hover. */
export const ENV_TITLE: Record<EnvKind, string | undefined> = {
  prod: "Продакшн — будьте осторожны",
  stage: "Stage",
  nonprod: undefined,
  unknown: undefined,
};
