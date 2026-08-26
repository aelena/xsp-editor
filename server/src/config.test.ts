import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { defaultDataDir, loadConfig, auditPath, databasePath } from "./config.js";

const HOME = join("/home", "someone");

describe("defaultDataDir", () => {
  it("uses APPDATA on Windows", () => {
    const dir = defaultDataDir("win32", { APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, HOME);
    expect(dir).toBe(join("C:\\Users\\a\\AppData\\Roaming", "xsp-editor"));
  });

  it("falls back to the usual Roaming path when APPDATA is unset", () => {
    // A service account or a stripped environment can be missing it, and the
    // failure mode without a fallback is writing to the process's cwd.
    const dir = defaultDataDir("win32", {}, HOME);
    expect(dir).toBe(join(HOME, "AppData", "Roaming", "xsp-editor"));
  });

  it("uses Application Support on macOS", () => {
    expect(defaultDataDir("darwin", {}, HOME)).toBe(
      join(HOME, "Library", "Application Support", "xsp-editor"),
    );
  });

  it("honours XDG_DATA_HOME elsewhere", () => {
    expect(defaultDataDir("linux", { XDG_DATA_HOME: "/data" }, HOME)).toBe(
      join("/data", "xsp-editor"),
    );
  });

  it("falls back to the XDG default when the variable is unset", () => {
    expect(defaultDataDir("linux", {}, HOME)).toBe(
      join(HOME, ".local", "share", "xsp-editor"),
    );
  });

  it("never points inside the installation", () => {
    // The failure this replaced: the audit trail defaulted to server/data
    // inside the repository, where a reinstall or a git clean takes it with
    // them, and where a read-only install directory stops it working at all.
    for (const platform of ["win32", "darwin", "linux"] as NodeJS.Platform[]) {
      expect(defaultDataDir(platform, {}, HOME)).not.toContain("server");
    }
  });
});

describe("loadConfig", () => {
  it("lets XSP_DATA_DIR override the platform default", () => {
    expect(loadConfig({ XSP_DATA_DIR: "/tmp/scratch" }).dataDir).toBe("/tmp/scratch");
  });

  it("defaults the port to the one the client proxies to", () => {
    expect(loadConfig({}).port).toBe(5999);
  });

  it("reads the port from the environment", () => {
    expect(loadConfig({ PORT: "6100" }).port).toBe(6100);
  });
});

describe("storage selection", () => {
  it("is durable by default", async () => {
    // The wrong default here loses someone's work, so it is not memory.
    expect(loadConfig({}).storage).toBe("sqlite");
  });

  it("accepts memory when asked", () => {
    expect(loadConfig({ XSP_STORAGE: "memory" }).storage).toBe("memory");
  });

  it("refuses a value it does not recognise", () => {
    // A typo in an environment variable answered by silently using memory is a
    // configuration mistake paid for with data.
    expect(() => loadConfig({ XSP_STORAGE: "sqlight" })).toThrow(/XSP_STORAGE/);
  });

  it("treats an empty value as unset", () => {
    expect(loadConfig({ XSP_STORAGE: "" }).storage).toBe("sqlite");
  });
});

describe("databasePath", () => {
  it("sits inside the data directory", () => {
    const config = loadConfig({ XSP_DATA_DIR: "/tmp/scratch" });
    expect(databasePath(config)).toBe(join("/tmp/scratch", "xsp-editor.db"));
  });
});

describe("auditPath", () => {
  it("sits inside the data directory", () => {
    const config = loadConfig({ XSP_DATA_DIR: "/tmp/scratch" });
    expect(auditPath(config)).toBe(join("/tmp/scratch", "audit.jsonl"));
  });
});
