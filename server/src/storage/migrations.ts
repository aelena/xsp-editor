import type { DatabaseSync } from "node:sqlite";

/**
 * Ordered, once-only schema migrations.
 *
 * This exists from the first version rather than being added when it hurts. The
 * moment anyone other than the author has data in their own file, every schema
 * change of ours becomes their problem, and the difference between "upgrade and
 * carry on" and "delete your database and start again" is the difference
 * between a tool someone keeps and one they abandon.
 *
 * Rules for adding one: append, never edit. A migration that has run somewhere
 * is history, and rewriting it means two installations with the same recorded
 * version and different schemas, which is worse than any mistake it would fix.
 * Correct a bad migration with another migration.
 */
export interface Migration {
  /** Monotonic. The applied high-water mark is what `schema_version` stores. */
  id: number;
  name: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "initial schema",
    up: `
      -- Membership is a join table rather than a JSON column on the artifact,
      -- because it is filtered on: listing a project's prompts and building the
      -- tree both ask "who belongs to this", and a JSON array answers that with
      -- a full scan. The derived arrays below stay JSON for the opposite
      -- reason: nothing queries into them except by whole value.
      CREATE TABLE prompts (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        description             TEXT NOT NULL DEFAULT '',
        version                 TEXT NOT NULL,
        content                 TEXT NOT NULL,
        variables               TEXT NOT NULL DEFAULT '{}',
        tags_used               TEXT NOT NULL DEFAULT '[]',
        constraints_referenced  TEXT NOT NULL DEFAULT '[]',
        author                  TEXT NOT NULL DEFAULT 'anonymous',
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL,
        verification_status     TEXT NOT NULL DEFAULT 'unchecked',
        metadata                TEXT NOT NULL DEFAULT '{}',
        forked_from             TEXT
      );
      CREATE INDEX idx_prompts_updated_at ON prompts(updated_at DESC);
      CREATE INDEX idx_prompts_author ON prompts(author);

      CREATE TABLE prompt_versions (
        prompt_id          TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
        version            TEXT NOT NULL,
        content            TEXT NOT NULL,
        author             TEXT NOT NULL,
        changelog_summary  TEXT NOT NULL DEFAULT '',
        version_bump_type  TEXT NOT NULL,
        created_at         TEXT NOT NULL,
        PRIMARY KEY (prompt_id, version)
      );

      CREATE TABLE tags (
        name         TEXT PRIMARY KEY,
        purpose      TEXT NOT NULL,
        use_when     TEXT NOT NULL,
        example      TEXT NOT NULL DEFAULT '',
        enforcement  TEXT NOT NULL DEFAULT 'optional',
        usage_count  INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE constraints (
        id           TEXT PRIMARY KEY,
        description  TEXT NOT NULL,
        severity     TEXT NOT NULL,
        category     TEXT NOT NULL,
        owner        TEXT NOT NULL DEFAULT '',
        status       TEXT NOT NULL DEFAULT 'active',
        xml_block    TEXT NOT NULL DEFAULT '',
        usage_count  INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE templates (
        name         TEXT PRIMARY KEY,
        description  TEXT NOT NULL DEFAULT '',
        content      TEXT NOT NULL,
        category     TEXT NOT NULL DEFAULT 'general',
        is_builtin   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        forked_from  TEXT
      );

      CREATE TABLE projects (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        path         TEXT,
        is_git_repo  INTEGER NOT NULL DEFAULT 0,
        is_reserved  INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      -- Two projects sharing a name produce a tree nobody can read.
      CREATE UNIQUE INDEX idx_projects_name ON projects(name COLLATE NOCASE);

      -- One table for both artifact kinds. They obey the same membership rules,
      -- so splitting them would mean writing every query twice to no benefit.
      -- No foreign key to the artifact, because the key is an id for a prompt
      -- and a name for a template and SQLite cannot express that; the adapter
      -- clears memberships on delete instead.
      CREATE TABLE memberships (
        artifact_kind  TEXT NOT NULL CHECK (artifact_kind IN ('prompt', 'template')),
        artifact_key   TEXT NOT NULL,
        project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        PRIMARY KEY (artifact_kind, artifact_key, project_id)
      );
      CREATE INDEX idx_memberships_project ON memberships(project_id, artifact_kind);

      -- Append-only in practice: nothing in the application updates or deletes
      -- from here. Whole membership sets on each side rather than a delta, so
      -- one row answers "what was true before this" and a missing row shows up
      -- as two consecutive rows whose after and before disagree.
      CREATE TABLE audit (
        seq            INTEGER PRIMARY KEY AUTOINCREMENT,
        at             TEXT NOT NULL,
        actor          TEXT NOT NULL,
        kind           TEXT NOT NULL,
        artifact_id    TEXT NOT NULL,
        artifact_name  TEXT NOT NULL,
        operation      TEXT NOT NULL,
        project        TEXT,
        before_set     TEXT NOT NULL DEFAULT '[]',
        after_set      TEXT NOT NULL DEFAULT '[]',
        detail         TEXT
      );
      CREATE INDEX idx_audit_artifact ON audit(artifact_id, seq);
    `,
  },
];

/**
 * Bring a database up to the latest schema, and report what it did.
 *
 * Each migration runs inside its own transaction together with the row that
 * records it, so a failure halfway leaves the database at the last version that
 * fully applied rather than in a state no version describes.
 */
export function migrate(db: DatabaseSync): { from: number; to: number; applied: string[] } {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    )
  `);

  const row = db.prepare("SELECT MAX(id) AS current FROM schema_version").get() as {
    current: number | null;
  };
  const from = row.current ?? 0;
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (migration.id <= from) continue;

    db.exec("BEGIN");
    try {
      db.exec(migration.up);
      db.prepare(
        "INSERT INTO schema_version (id, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.id, migration.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migration ${migration.id} (${migration.name}) failed, database left at version ${
          from + applied.length
        }: ${(err as Error).message}`,
        { cause: err },
      );
    }
    applied.push(migration.name);
  }

  return { from, to: from + applied.length, applied };
}

/**
 * Refuse to open a database newer than this build understands.
 *
 * Without this, an older build silently reads a newer schema, misses columns it
 * does not know about, and writes rows that lose whatever the newer version was
 * storing. Downgrading should be an error message, not data loss.
 */
export function assertNotFromTheFuture(db: DatabaseSync): void {
  const row = db.prepare("SELECT MAX(id) AS current FROM schema_version").get() as {
    current: number | null;
  };
  const current = row.current ?? 0;
  const latest = MIGRATIONS[MIGRATIONS.length - 1]?.id ?? 0;

  if (current > latest) {
    throw new Error(
      `This database is at schema version ${current} and this build only knows ${latest}. ` +
        "It was written by a newer version of the application. Upgrade rather than " +
        "downgrade: an older build would quietly drop whatever the newer one stored.",
    );
  }
}
