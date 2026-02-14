const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const current: Level =
  (process.env.LOG_LEVEL as Level) in LEVELS
    ? (process.env.LOG_LEVEL as Level)
    : "info";

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[current];
}

function ts(): string {
  return new Date().toISOString();
}

export const log = {
  debug: (...args: unknown[]) => {
    if (shouldLog("debug")) console.debug(`[${ts()}] DEBUG`, ...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog("info")) console.log(`[${ts()}] INFO`, ...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(`[${ts()}] WARN`, ...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog("error")) console.error(`[${ts()}] ERROR`, ...args);
  },
};
