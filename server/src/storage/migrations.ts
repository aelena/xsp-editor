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
  {
    id: 2,
    name: "users and sessions",
    up: `
      CREATE TABLE users (
        id             TEXT PRIMARY KEY,
        username       TEXT NOT NULL,
        display_name   TEXT NOT NULL DEFAULT '',
        -- The full scrypt encoding, parameters included, so a future change to
        -- the cost can be rolled out per user on their next login instead of
        -- invalidating everyone's password at once.
        password_hash  TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_users_username ON users(username COLLATE NOCASE);

      -- Opaque server-side sessions rather than a self-contained token, because
      -- a token you cannot invalidate is a token you cannot take back. Deleting
      -- the row ends the session.
      --
      -- token_hash, not the token: a database that leaks should not also hand
      -- over every live session. SHA-256 rather than scrypt is right here, since
      -- these are 256 bits of randomness and not a guessable secret.
      CREATE TABLE sessions (
        token_hash  TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
    `,
  },
  {
    id: 3,
    name: "free-form labels",
    up: `
      -- Free-form labels on an artifact, in the Azure DevOps sense: arbitrary
      -- strings with no rules, no reserved values and no vocabulary behind them.
      --
      -- Deliberately not the tags table. That one holds XML element names with a
      -- purpose, a use_when and an enforcement level, and the verification engine
      -- checks a prompt's body against it. Putting free text in there would mean
      -- a label acquiring "required" enforcement failed every prompt in the store
      -- for not containing a <draft> element. Same word, two jobs, two tables.
      --
      -- One row per artifact per label, like memberships, so counting how many
      -- things carry a label and renaming one everywhere are both one statement.
      CREATE TABLE labels (
        artifact_kind  TEXT NOT NULL CHECK (artifact_kind IN ('prompt', 'template')),
        artifact_key   TEXT NOT NULL,
        label          TEXT NOT NULL,
        PRIMARY KEY (artifact_kind, artifact_key, label)
      );
      -- The management view asks "who carries this label", so that is the index.
      CREATE INDEX idx_labels_label ON labels(label COLLATE NOCASE);
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
export function ensureVersionTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    )
  `);
}

export function migrate(db: DatabaseSync): { from: number; to: number; applied: string[] } {
  db.exec("PRAGMA foreign_keys = ON");
  ensureVersionTable(db);

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
  // A database that has never been migrated is at version 0, which is behind
  // rather than ahead. Creating the table here means the check works on a fresh
  // file instead of failing with "no such table", which is how the contract
  // suite found this.
  ensureVersionTable(db);

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
