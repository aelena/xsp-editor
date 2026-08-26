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
  host: string;
  /** Whether a session is needed to reach the API. */
  authRequired: boolean;
}

/**
 * Whether an address only accepts connections from this machine.
 *
 * This decides the auth default, so it errs towards treating an address as
 * reachable: anything not recognisably local counts as exposed.
 */
export function isLoopbackHost(host: string): boolean {
  const bare = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (bare === "localhost" || bare === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
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
  const host = env.HOST || "127.0.0.1";
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
    host,
    authRequired: parseAuth(env.XSP_AUTH, host),
  };
}

/**
 * Authentication is required by default as soon as the server is reachable from
 * off this machine, and off by default when it is not.
 *
 * The alternative defaults are both bad. Always on means a login screen between
 * one person and their own local tool, which is friction with nothing behind it
 * given the API is already only answering to 127.0.0.1. Always off means the
 * moment somebody sets HOST to reach it from a laptop, an unauthenticated API
 * that reads and writes files goes on the network.
 *
 * XSP_AUTH=on turns it on for a local instance too, which is what a shared
 * machine wants. XSP_AUTH=off turns it off anywhere, including where it should
 * not be; that is the user's call to make, and server.ts says so loudly when
 * they make it.
 */
function parseAuth(value: string | undefined, host: string): boolean {
  if (value === "on") return true;
  if (value === "off") return false;
  if (value !== undefined && value !== "") {
    throw new Error(`XSP_AUTH must be "on" or "off", not ${JSON.stringify(value)}.`);
  }
  return !isLoopbackHost(host);
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
