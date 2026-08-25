import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileAuditLog,
  createMemoryAuditLog,
  LOCAL_ACTOR,
  type AuditInput,
} from "./audit.js";

const GENERAL = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000001";

function entry(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    kind: "prompt",
    artifact_id: "p1",
    artifact_name: "classify-intent",
    operation: "added_to",
    project: A,
    before: [GENERAL],
    after: [GENERAL, A],
    ...overrides,
  };
}

describe("createMemoryAuditLog", () => {
  it("stamps a time and the placeholder actor", () => {
    const log = createMemoryAuditLog();
    return log.record(entry()).then(() => {
      const [only] = log.all();
      expect(only.actor).toBe(LOCAL_ACTOR);
      expect(Date.parse(only.at)).not.toBeNaN();
    });
  });

  it("returns only the entries for the artifact asked about", async () => {
    const log = createMemoryAuditLog();
    await log.record(entry({ artifact_id: "p1" }));
    await log.record(entry({ artifact_id: "p2" }));
    expect(await log.read("p1")).toHaveLength(1);
  });
});

describe("createFileAuditLog", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "xsp-audit-"));
    path = join(dir, "nested", "audit.jsonl");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("answers an empty history before anything has happened", async () => {
    // An absent trail and an empty one are the same answer to "what happened to
    // this artifact", and the caller should not have to catch ENOENT to find out.
    const log = createFileAuditLog(path);
    expect(await log.read("p1")).toEqual([]);
  });

  it("creates the directory it was pointed at", async () => {
    const log = createFileAuditLog(path);
    await log.record(entry());
    expect((await readFile(path, "utf-8")).length).toBeGreaterThan(0);
  });

  it("recovers when the directory disappears under it", async () => {
    // Found by deleting data/ while a server was running: the mkdir used to be
    // memoised, so every later append failed with ENOENT and the log stayed
    // broken for the life of the process. An audit trail that gives up
    // permanently because a folder moved fails when it is meant to be evidence.
    const log = createFileAuditLog(path);
    await log.record(entry({ operation: "created" }));
    await rm(join(dir, "nested"), { recursive: true, force: true });

    await log.record(entry({ operation: "archived" }));

    const history = await log.read("p1");
    expect(history.map((e) => e.operation)).toEqual(["archived"]);
  });

  it("writes one JSON object per line", async () => {
    const log = createFileAuditLog(path);
    await log.record(entry({ operation: "created" }));
    await log.record(entry({ operation: "added_to" }));

    const lines = (await readFile(path, "utf-8")).split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("appends rather than replacing, across separate log instances", async () => {
    // The trail has to survive a restart, which is the only durable thing in a
    // system whose store is an in-memory Map.
    await createFileAuditLog(path).record(entry({ operation: "created" }));
    await createFileAuditLog(path).record(entry({ operation: "archived" }));

    const history = await createFileAuditLog(path).read("p1");
    expect(history.map((e) => e.operation)).toEqual(["created", "archived"]);
  });

  it("keeps the whole set on each side, not a delta", async () => {
    const log = createFileAuditLog(path);
    await log.record(entry({ before: [GENERAL], after: [GENERAL, A] }));

    const [only] = await log.read("p1");
    expect(only.before).toEqual([GENERAL]);
    expect(only.after).toEqual([GENERAL, A]);
  });

  it("survives a torn final line from a crash mid-append", async () => {
    // Refusing to show any history because the most recent line is damaged is
    // the wrong failure for an audit trail.
    const log = createFileAuditLog(path);
    await log.record(entry({ operation: "created" }));
    await writeFile(path, (await readFile(path, "utf-8")) + '{"artifact_id":"p1"', "utf-8");

    const history = await log.read("p1");
    expect(history).toHaveLength(1);
    expect(history[0].operation).toBe("created");
  });

  it("carries fork provenance in detail", async () => {
    const log = createFileAuditLog(path);
    await log.record(
      entry({
        operation: "forked_from",
        detail: { source_id: "p0", source_name: "classify-intent", source_version: "1.2.0" },
      }),
    );

    const [only] = await log.read("p1");
    expect(only.detail?.source_version).toBe("1.2.0");
  });
});
