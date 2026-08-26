import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStorageAdapter } from "./sqlite.js";
import { LOCAL_ACTOR, type AuditInput } from "../services/audit.js";
import { GENERAL_PROJECT_ID, ARCHIVE_PROJECT_ID } from "../schemas/projects.js";

function entry(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    kind: "prompt",
    artifact_id: "p1",
    artifact_name: "classify-intent",
    operation: "added_to",
    project: GENERAL_PROJECT_ID,
    before: [],
    after: [GENERAL_PROJECT_ID],
    ...overrides,
  };
}

describe("the audit log backed by the database", () => {
  it("stamps the time and the actor", async () => {
    const audit = new SqliteStorageAdapter(":memory:").auditLog();
    await audit.record(entry());

    const [only] = await audit.read("p1");
    expect(only.actor).toBe(LOCAL_ACTOR);
    expect(Date.parse(only.at)).not.toBeNaN();
  });

  it("returns only the entries for the artifact asked about", async () => {
    const audit = new SqliteStorageAdapter(":memory:").auditLog();
    await audit.record(entry({ artifact_id: "p1" }));
    await audit.record(entry({ artifact_id: "p2" }));

    expect(await audit.read("p1")).toHaveLength(1);
  });

  it("keeps the whole set on each side, not a delta", async () => {
    const audit = new SqliteStorageAdapter(":memory:").auditLog();
    await audit.record(entry({ before: [GENERAL_PROJECT_ID], after: [ARCHIVE_PROJECT_ID] }));

    const [only] = await audit.read("p1");
    expect(only.before).toEqual([GENERAL_PROJECT_ID]);
    expect(only.after).toEqual([ARCHIVE_PROJECT_ID]);
  });

  it("returns entries in the order they happened, not by timestamp", async () => {
    // Several entries can land in the same millisecond, and the before/after
    // chain only reads correctly in insertion order.
    const audit = new SqliteStorageAdapter(":memory:").auditLog();
    for (const operation of ["created", "added_to", "archived"] as const) {
      await audit.record(entry({ operation }));
    }

    expect((await audit.read("p1")).map((e) => e.operation)).toEqual([
      "created",
      "added_to",
      "archived",
    ]);
  });

  it("carries detail when there is some and omits it when there is not", async () => {
    const audit = new SqliteStorageAdapter(":memory:").auditLog();
    await audit.record(entry({ operation: "created" }));
    await audit.record(entry({ operation: "forked_from", detail: { source_id: "p0" } }));

    const [plain, forked] = await audit.read("p1");
    expect(plain.detail).toBeUndefined();
    expect(forked.detail).toEqual({ source_id: "p0" });
  });

  it("answers an empty history for an artifact nothing has happened to", async () => {
    const audit = new SqliteStorageAdapter(":memory:").auditLog();
    expect(await audit.read("never-touched")).toEqual([]);
  });
});

describe("the trail travels with the data", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "xsp-db-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("survives a restart, in the same file as the data", async () => {
    // This is the reason it moved out of a separate JSONL: one file to copy,
    // and no way to back up the data without its history or the other way round.
    const path = join(dir, "nested", "xsp-editor.db");

    const first = new SqliteStorageAdapter(path);
    await first.createProject({
      id: GENERAL_PROJECT_ID, name: "General", path: null, is_git_repo: false,
      is_reserved: true, created_at: "", updated_at: "",
    });
    await first.auditLog().record(entry({ operation: "created" }));
    first.close();

    const second = new SqliteStorageAdapter(path);
    expect((await second.auditLog().read("p1")).map((e) => e.operation)).toEqual(["created"]);
    expect(await second.getProject(GENERAL_PROJECT_ID)).not.toBeNull();
    second.close();
  });

  it("creates the directory it was pointed at", async () => {
    const adapter = new SqliteStorageAdapter(join(dir, "a", "b", "xsp-editor.db"));
    expect(await adapter.listProjects()).toEqual([]);
    adapter.close();
  });
});
