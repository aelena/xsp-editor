import { homedir } from "node:os";
import { join } from "node:path";

/**
 * "sqlite" keeps data across restarts. "memory" throws it away, which is right
 * for tests and for a throwaway demo and wrong for anything else.
 */
export type StorageKind = "sqlite" | "memory";

export interface AppConfig {
  port: number;
  apiAuthToken?: string;
  /** Where this application's own data lives. Nothing is shared with anything else. */
  dataDir: string;
  storage: StorageKind;
}

const APP_DIR_NAME = "xsp-editor";

/**
 * The per-user data directory for this platform.
 *
 * Not a directory inside the installation. Data written next to the code is
 * lost on reinstall, swept by `git clean`, and fails outright when the
 * application sits somewhere read-only. That is tolerable while the only user
 * is the person who wrote it and wrong for anyone who installs it.
 *
 * The conventions differ per platform and users expect their own, so this
 * follows each rather than inventing a dotfile that is right nowhere.
 */
export function defaultDataDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  if (platform === "win32") {
    return join(env.APPDATA || join(home, "AppData", "Roaming"), APP_DIR_NAME);
  }
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", APP_DIR_NAME);
  }
  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), APP_DIR_NAME);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: parseInt(env.PORT || "5999", 10),
    apiAuthToken: env.API_AUTH_TOKEN,
    // Overridable, because a user may want their data on another volume, in a
    // synced folder, or in a container mount, and because a second instance
    // pointed elsewhere is how you get a scratch copy without touching the real
    // one.
    dataDir: env.XSP_DATA_DIR || defaultDataDir(process.platform, env),
    // Durable by default. An unrecognised value is a typo in someone's
    // environment, and silently falling back to memory would answer it by
    // losing their data, so it fails loudly instead.
    storage: parseStorageKind(env.XSP_STORAGE),
  };
}

function parseStorageKind(value: string | undefined): StorageKind {
  if (value === undefined || value === "") return "sqlite";
  if (value === "sqlite" || value === "memory") return value;
  throw new Error(
    `XSP_STORAGE must be "sqlite" or "memory", not ${JSON.stringify(value)}.`,
  );
}

/** Where the database file lives. */
export function databasePath(config: AppConfig): string {
  return join(config.dataDir, "xsp-editor.db");
}

/** Where the append-only audit trail is written. */
export function auditPath(config: AppConfig): string {
  return join(config.dataDir, "audit.jsonl");
}
