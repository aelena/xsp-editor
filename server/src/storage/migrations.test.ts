import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS, migrate, assertNotFromTheFuture } from "./migrations.js";

function fresh() {
  return new DatabaseSync(":memory:");
}

function tableNames(db: DatabaseSync): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name);
}

describe("migrate", () => {
  it("creates every table the adapter needs", () => {
    const db = fresh();
    migrate(db);

    const names = tableNames(db);
    for (const table of [
      "prompts",
      "prompt_versions",
      "tags",
      "constraints",
      "templates",
      "projects",
      "memberships",
      "audit",
      "schema_version",
    ]) {
      expect(names, `missing ${table}`).toContain(table);
    }
  });

  it("reports what it did", () => {
    const result = migrate(fresh());
    expect(result.from).toBe(0);
    expect(result.to).toBe(MIGRATIONS.length);
    expect(result.applied).toHaveLength(MIGRATIONS.length);
  });

  it("is a no-op the second time", () => {
    // The whole point: a user runs the application again and their data is
    // still there, rather than the schema being rebuilt underneath it.
    const db = fresh();
    migrate(db);
    const second = migrate(db);

    expect(second.applied).toEqual([]);
    expect(second.from).toBe(MIGRATIONS.length);
  });

  it("keeps data across a second run", () => {
    const db = fresh();
    migrate(db);
    db.prepare(
      "INSERT INTO projects (id, name, path, is_git_repo, is_reserved, created_at, updated_at) VALUES (?, ?, NULL, 0, 0, '', '')",
    ).run("p1", "Alpha");

    migrate(db);

    const count = db.prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("leaves the database at the last good version when one fails", () => {
    // A half-applied migration puts the schema in a state no version describes,
    // and the next run would then skip or repeat arbitrary parts of it.
    const db = fresh();
    migrate(db);

    const broken = [...MIGRATIONS, { id: 999, name: "broken", up: "THIS IS NOT SQL" }];
    const original = MIGRATIONS.length;
    MIGRATIONS.push(broken[broken.length - 1]);

    try {
      expect(() => migrate(db)).toThrow(/Migration 999/);
      const row = db.prepare("SELECT MAX(id) AS current FROM schema_version").get() as {
        current: number;
      };
      expect(row.current).toBe(original);
    } finally {
      MIGRATIONS.pop();
    }
  });

  it("enforces foreign keys", () => {
    // Off by default in SQLite, per connection. A membership pointing at a
    // project that does not exist is exactly the orphan the model forbids.
    const db = fresh();
    migrate(db);

    expect(() =>
      db
        .prepare(
          "INSERT INTO memberships (artifact_kind, artifact_key, project_id) VALUES ('prompt', 'x', 'nope')",
        )
        .run(),
    ).toThrow();
  });

  it("refuses two projects whose names differ only by case", () => {
    const db = fresh();
    migrate(db);
    const insert = db.prepare(
      "INSERT INTO projects (id, name, path, is_git_repo, is_reserved, created_at, updated_at) VALUES (?, ?, NULL, 0, 0, '', '')",
    );
    insert.run("p1", "Alpha");

    expect(() => insert.run("p2", "alpha")).toThrow();
  });

  it("rejects an artifact kind that is neither prompt nor template", () => {
    const db = fresh();
    migrate(db);
    db.prepare(
      "INSERT INTO projects (id, name, path, is_git_repo, is_reserved, created_at, updated_at) VALUES ('p1', 'Alpha', NULL, 0, 0, '', '')",
    ).run();

    expect(() =>
      db
        .prepare(
          "INSERT INTO memberships (artifact_kind, artifact_key, project_id) VALUES ('constraint', 'x', 'p1')",
        )
        .run(),
    ).toThrow();
  });

  it("has no duplicate or out-of-order migration ids", () => {
    // Append, never edit. Two installations at the same recorded version with
    // different schemas is worse than whatever the edit was fixing.
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe("assertNotFromTheFuture", () => {
  it("passes on a database this build wrote", () => {
    const db = fresh();
    migrate(db);
    expect(() => assertNotFromTheFuture(db)).not.toThrow();
  });

  it("refuses one written by a newer build", () => {
    // The alternative is an older build reading a newer schema, ignoring
    // columns it does not know about, and writing rows that drop them. A
    // downgrade should be an error, not silent data loss.
    const db = fresh();
    migrate(db);
    db.prepare("INSERT INTO schema_version (id, name, applied_at) VALUES (9999, 'future', '')").run();

    expect(() => assertNotFromTheFuture(db)).toThrow(/newer version/);
  });
});
