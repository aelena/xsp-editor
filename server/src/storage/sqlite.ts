import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  StorageAdapter,
  ListPromptsOptions,
  ListPromptsResult,
  ListConstraintsOptions,
  ListTagsOptions,
  PaginatedResult,
} from "./adapter.js";
import type { PromptRecord, PromptVersionRecord } from "../schemas/prompts.js";
import type { TagRecord } from "../schemas/tags.js";
import type { ConstraintRecord } from "../schemas/constraints.js";
import type { TemplateRecord, TemplateVersionRecord } from "../schemas/templates.js";
import type { ProjectRecord } from "../schemas/projects.js";
import { ARCHIVE_PROJECT_ID, GENERAL_PROJECT_ID } from "../schemas/projects.js";
import { migrate, assertNotFromTheFuture } from "./migrations.js";
import { LOCAL_ACTOR, type AuditEntry, type AuditInput, type AuditLog } from "../services/audit.js";

/**
 * The durable adapter, on node:sqlite.
 *
 * The built-in rather than better-sqlite3 because it is a native module and CI
 * crosses Windows and Linux, which is exactly where prebuilt native modules go
 * wrong. It is marked experimental and its API could change; that risk is
 * acceptable because StorageAdapter is the seam, so swapping the driver is this
 * one file.
 *
 * Everything here is synchronous under an async interface. node:sqlite has no
 * async API, and SQLite on a local file is fast enough that pretending
 * otherwise would add complexity without buying concurrency.
 */

type Row = Record<string, unknown>;

/** Bound query parameters, as the driver types them. */
type Params = SQLInputValue[];

const asText = (value: unknown): string => (value == null ? "" : String(value));
const asBool = (value: unknown): boolean => value === 1 || value === true;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    // A column that will not parse is corruption, but refusing to return the
    // record at all would hide the rest of it. The empty default is visible in
    // the UI; a thrown error here is not.
    return fallback;
  }
}

export class SqliteStorageAdapter implements StorageAdapter {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.db = new DatabaseSync(filename);
    // Write-ahead logging: a reader does not block the writer, which matters
    // the moment the UI polls while something is being saved.
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    assertNotFromTheFuture(this.db);
    migrate(this.db);
  }

  close(): void {
    this.db.close();
  }

  /**
   * The connection, for the auth store.
   *
   * Shared on purpose: users and sessions belong in the same file as everything
   * else, so a copied database is a complete one. Exposed rather than folding
   * six auth methods into StorageAdapter, which would make every future backend
   * implement both concerns to provide either.
   */
  database(): DatabaseSync {
    return this.db;
  }

  /**
   * Run a unit of work as one transaction, so a partial write cannot survive.
   *
   * The callback must be synchronous, and every caller in this file is. That is
   * not a style preference: this adapter holds one connection, and two async
   * callers that each BEGIN, await, and COMMIT will interleave and the second
   * BEGIN throws "cannot start a transaction within a transaction". A callback
   * with no awaits in it runs to completion before any other request resumes,
   * which is what makes these safe.
   *
   * The same fact is why the audit trail is not written inside the same
   * transaction as the change it records: that would span an async route
   * handler. See services/audit.ts.
   */
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /**
   * An audit log backed by this same database.
   *
   * Same connection and same file as the data, so the trail travels with what it
   * describes: a copied database carries its own history, and a query can join
   * the two. The JSONL file it replaces was durable but separate, which meant
   * backing up one and not the other was possible and silent.
   */
  auditLog(): AuditLog {
    const db = this.db;
    return {
      async record(entry: AuditInput): Promise<void> {
        db.prepare(
          `INSERT INTO audit (at, actor, kind, artifact_id, artifact_name,
             operation, project, before_set, after_set, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          new Date().toISOString(),
          LOCAL_ACTOR,
          entry.kind,
          entry.artifact_id,
          entry.artifact_name,
          entry.operation,
          entry.project ?? null,
          JSON.stringify(entry.before ?? []),
          JSON.stringify(entry.after ?? []),
          entry.detail ? JSON.stringify(entry.detail) : null,
        );
      },

      async read(artifactId: string): Promise<AuditEntry[]> {
        // By seq, which is insertion order. Ordering by `at` would reorder
        // entries written inside the same millisecond, and the before/after
        // chain only reads correctly in the order things happened.
        const rows = db
          .prepare("SELECT * FROM audit WHERE artifact_id = ? ORDER BY seq ASC")
          .all(artifactId) as Row[];

        return rows.map((row) => ({
          at: asText(row.at),
          actor: asText(row.actor),
          kind: asText(row.kind) as AuditEntry["kind"],
          artifact_id: asText(row.artifact_id),
          artifact_name: asText(row.artifact_name),
          operation: asText(row.operation) as AuditEntry["operation"],
          project: row.project == null ? null : String(row.project),
          before: parseJson<string[]>(row.before_set, []),
          after: parseJson<string[]>(row.after_set, []),
          ...(row.detail ? { detail: parseJson<Record<string, string>>(row.detail, {}) } : {}),
        }));
      },
    };
  }

  // --- Membership -----------------------------------------------------------
  //
  // Held in its own table but exposed as `projects` on the record, because that
  // is the shape the routes and the client already speak. Read in one query per
  // page rather than one per row: the tree and the listings would otherwise be
  // an N+1 that only shows up once someone has a few hundred prompts.

  private membershipsFor(
    kind: "prompt" | "template",
    keys: string[],
  ): Map<string, string[]> {
    const byKey = new Map<string, string[]>(keys.map((key) => [key, []]));
    if (keys.length === 0) return byKey;

    const placeholders = keys.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT artifact_key, project_id FROM memberships
         WHERE artifact_kind = ? AND artifact_key IN (${placeholders})`,
      )
      .all(kind, ...keys) as Row[];

    for (const row of rows) {
      byKey.get(asText(row.artifact_key))?.push(asText(row.project_id));
    }
    for (const list of byKey.values()) list.sort();
    return byKey;
  }

  private setMemberships(
    kind: "prompt" | "template",
    key: string,
    projects: readonly string[],
  ): void {
    this.db
      .prepare("DELETE FROM memberships WHERE artifact_kind = ? AND artifact_key = ?")
      .run(kind, key);
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO memberships (artifact_kind, artifact_key, project_id) VALUES (?, ?, ?)",
    );
    for (const projectId of new Set(projects)) insert.run(kind, key, projectId);
  }

  // --- Prompts --------------------------------------------------------------

  private toPrompt(row: Row, projects: string[]): PromptRecord {
    const forked = parseJson<PromptRecord["forked_from"] | null>(row.forked_from, null);
    return {
      id: asText(row.id),
      name: asText(row.name),
      description: asText(row.description),
      version: asText(row.version),
      content: asText(row.content),
      variables: parseJson(row.variables, {}),
      tags_used: parseJson(row.tags_used, []),
      constraints_referenced: parseJson(row.constraints_referenced, []),
      author: asText(row.author),
      created_at: asText(row.created_at),
      updated_at: asText(row.updated_at),
      verification_status: asText(row.verification_status) as PromptRecord["verification_status"],
      metadata: parseJson(row.metadata, {}),
      projects,
      ...(forked ? { forked_from: forked } : {}),
    };
  }

  async createPrompt(prompt: PromptRecord): Promise<void> {
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO prompts (id, name, description, version, content, variables,
             tags_used, constraints_referenced, author, created_at, updated_at,
             verification_status, metadata, forked_from)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          prompt.id,
          prompt.name,
          prompt.description,
          prompt.version,
          prompt.content,
          JSON.stringify(prompt.variables ?? {}),
          JSON.stringify(prompt.tags_used ?? []),
          JSON.stringify(prompt.constraints_referenced ?? []),
          prompt.author,
          prompt.created_at,
          prompt.updated_at,
          prompt.verification_status,
          JSON.stringify(prompt.metadata ?? {}),
          prompt.forked_from ? JSON.stringify(prompt.forked_from) : null,
        );
      this.setMemberships("prompt", prompt.id, prompt.projects ?? [GENERAL_PROJECT_ID]);
    });
  }

  async getPrompt(id: string): Promise<PromptRecord | null> {
    const row = this.db.prepare("SELECT * FROM prompts WHERE id = ?").get(id) as Row | undefined;
    if (!row) return null;
    return this.toPrompt(row, this.membershipsFor("prompt", [id]).get(id) ?? []);
  }

  async updatePrompt(id: string, updates: Partial<PromptRecord>): Promise<void> {
    const exists = this.db.prepare("SELECT 1 FROM prompts WHERE id = ?").get(id);
    if (!exists) throw new Error(`Prompt ${id} not found`);

    const columns: Record<string, SQLInputValue> = {};
    const put = (key: string, value: SQLInputValue | undefined) => {
      if (value !== undefined) columns[key] = value;
    };

    put("name", updates.name);
    put("description", updates.description);
    put("version", updates.version);
    put("content", updates.content);
    put("author", updates.author);
    put("created_at", updates.created_at);
    put("updated_at", updates.updated_at);
    put("verification_status", updates.verification_status);
    if (updates.variables !== undefined) columns.variables = JSON.stringify(updates.variables);
    if (updates.tags_used !== undefined) columns.tags_used = JSON.stringify(updates.tags_used);
    if (updates.constraints_referenced !== undefined) {
      columns.constraints_referenced = JSON.stringify(updates.constraints_referenced);
    }
    if (updates.metadata !== undefined) columns.metadata = JSON.stringify(updates.metadata);
    if (updates.forked_from !== undefined) {
      columns.forked_from = updates.forked_from ? JSON.stringify(updates.forked_from) : null;
    }

    this.transaction(() => {
      const keys = Object.keys(columns);
      if (keys.length > 0) {
        this.db
          .prepare(`UPDATE prompts SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
          .run(...(keys.map((k) => columns[k]) as Params), id);
      }
      if (updates.projects !== undefined) {
        this.setMemberships("prompt", id, updates.projects);
      }
    });
  }

  async listPrompts(options: ListPromptsOptions): Promise<ListPromptsResult> {
    const where: string[] = [];
    const params: Params = [];

    if (!options.include_archived) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM memberships m WHERE m.artifact_kind = 'prompt'
           AND m.artifact_key = prompts.id AND m.project_id = ?)`,
      );
      params.push(ARCHIVE_PROJECT_ID);
    }
    if (options.project) {
      where.push(
        `EXISTS (SELECT 1 FROM memberships m WHERE m.artifact_kind = 'prompt'
           AND m.artifact_key = prompts.id AND m.project_id = ?)`,
      );
      params.push(options.project);
    }
    if (options.search) {
      where.push("(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)");
      const needle = `%${options.search.toLowerCase()}%`;
      params.push(needle, needle);
    }
    if (options.author) {
      where.push("author = ?");
      params.push(options.author);
    }
    if (options.tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(prompts.tags_used) WHERE value = ?)");
      params.push(options.tag);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM prompts ${clause}`).get(...params) as {
        n: number;
      }
    ).n;

    const rows = this.db
      .prepare(
        `SELECT * FROM prompts ${clause} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`,
      )
      .all(...params, options.limit, (options.page - 1) * options.limit) as Row[];

    const memberships = this.membershipsFor(
      "prompt",
      rows.map((r) => asText(r.id)),
    );

    return {
      prompts: rows.map((r) => this.toPrompt(r, memberships.get(asText(r.id)) ?? [])),
      total,
      page: options.page,
      limit: options.limit,
    };
  }

  /** Archives. Nothing is destroyed, and Archive is exclusive. */
  async deletePrompt(id: string): Promise<void> {
    const exists = this.db.prepare("SELECT 1 FROM prompts WHERE id = ?").get(id);
    if (!exists) throw new Error(`Prompt ${id} not found`);
    this.transaction(() => this.setMemberships("prompt", id, [ARCHIVE_PROJECT_ID]));
  }

  // --- Versions -------------------------------------------------------------

  async saveVersion(version: PromptVersionRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO prompt_versions
           (prompt_id, version, content, author, changelog_summary, version_bump_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        version.prompt_id,
        version.version,
        version.content,
        version.author,
        version.changelog_summary,
        version.version_bump_type,
        version.created_at,
      );
  }

  async getVersion(promptId: string, version: string): Promise<PromptVersionRecord | null> {
    const row = this.db
      .prepare("SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?")
      .get(promptId, version) as Row | undefined;
    return row ? (row as unknown as PromptVersionRecord) : null;
  }

  async listVersions(promptId: string): Promise<PromptVersionRecord[]> {
    // By insertion order, which is the order they happened. Sorting by the
    // version string would put 1.10.0 before 1.9.0.
    return this.db
      .prepare("SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY rowid ASC")
      .all(promptId) as unknown as PromptVersionRecord[];
  }

  // --- Tags -----------------------------------------------------------------

  async createTag(tag: TagRecord): Promise<void> {
    this.db
      .prepare(
        // Nothing references tags today. Written as an upsert anyway, so that
        // adding a foreign key later cannot quietly reintroduce the bug the two
        // tables above had.
        `INSERT INTO tags (name, purpose, use_when, example, enforcement,
           usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           purpose = excluded.purpose,
           use_when = excluded.use_when,
           example = excluded.example,
           enforcement = excluded.enforcement,
           usage_count = excluded.usage_count,
           updated_at = excluded.updated_at`,
      )
      .run(
        tag.name,
        tag.purpose,
        tag.use_when,
        tag.example,
        tag.enforcement,
        tag.usage_count,
        tag.created_at,
        tag.updated_at,
      );
  }

  async getTag(name: string): Promise<TagRecord | null> {
    const row = this.db.prepare("SELECT * FROM tags WHERE name = ?").get(name) as Row | undefined;
    return row ? (row as unknown as TagRecord) : null;
  }

  async updateTag(name: string, updates: Partial<TagRecord>): Promise<void> {
    const existing = await this.getTag(name);
    if (!existing) throw new Error(`Tag ${name} not found`);
    await this.createTag({ ...existing, ...updates, name });
  }

  async listTags(options?: ListTagsOptions): Promise<PaginatedResult<TagRecord>> {
    const where: string[] = [];
    const params: Params = [];

    if (options?.search) {
      where.push("(LOWER(name) LIKE ? OR LOWER(purpose) LIKE ?)");
      const needle = `%${options.search.toLowerCase()}%`;
      params.push(needle, needle);
    }
    if (options?.enforcement) {
      where.push("enforcement = ?");
      params.push(options.enforcement);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM tags ${clause}`).get(...params) as { n: number }
    ).n;
    const items = this.db
      .prepare(`SELECT * FROM tags ${clause} ORDER BY name ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, (page - 1) * limit) as unknown as TagRecord[];

    return { items, total, page, limit };
  }

  async deleteTag(name: string): Promise<void> {
    this.db.prepare("DELETE FROM tags WHERE name = ?").run(name);
  }

  // --- Constraints ----------------------------------------------------------

  async createConstraint(constraint: ConstraintRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO constraints (id, description, severity, category, owner,
           status, xml_block, usage_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           description = excluded.description,
           severity = excluded.severity,
           category = excluded.category,
           owner = excluded.owner,
           status = excluded.status,
           xml_block = excluded.xml_block,
           usage_count = excluded.usage_count,
           updated_at = excluded.updated_at`,
      )
      .run(
        constraint.id,
        constraint.description,
        constraint.severity,
        constraint.category,
        constraint.owner,
        constraint.status,
        constraint.xml_block,
        constraint.usage_count,
        constraint.created_at,
        constraint.updated_at,
      );
  }

  async getConstraint(id: string): Promise<ConstraintRecord | null> {
    const row = this.db.prepare("SELECT * FROM constraints WHERE id = ?").get(id) as
      | Row
      | undefined;
    return row ? (row as unknown as ConstraintRecord) : null;
  }

  async updateConstraint(id: string, updates: Partial<ConstraintRecord>): Promise<void> {
    const existing = await this.getConstraint(id);
    if (!existing) throw new Error(`Constraint ${id} not found`);
    await this.createConstraint({ ...existing, ...updates, id });
  }

  async listConstraints(
    options?: ListConstraintsOptions,
  ): Promise<PaginatedResult<ConstraintRecord>> {
    const where: string[] = [];
    const params: Params = [];

    for (const field of ["severity", "category", "status"] as const) {
      const value = options?.[field];
      if (value) {
        where.push(`${field} = ?`);
        params.push(value);
      }
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;

    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM constraints ${clause}`).get(...params) as {
        n: number;
      }
    ).n;
    const items = this.db
      .prepare(`SELECT * FROM constraints ${clause} ORDER BY id ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, (page - 1) * limit) as unknown as ConstraintRecord[];

    return { items, total, page, limit };
  }

  async deleteConstraint(id: string): Promise<void> {
    this.db.prepare("DELETE FROM constraints WHERE id = ?").run(id);
  }

  // --- Templates ------------------------------------------------------------

  private toTemplate(row: Row, projects: string[]): TemplateRecord {
    const forked = parseJson<TemplateRecord["forked_from"] | null>(row.forked_from, null);
    return {
      name: asText(row.name),
      description: asText(row.description),
      content: asText(row.content),
      category: asText(row.category),
      version: asText(row.version) || "1.0.0",
      is_builtin: asBool(row.is_builtin),
      created_at: asText(row.created_at),
      updated_at: asText(row.updated_at),
      projects,
      ...(forked ? { forked_from: forked } : {}),
    };
  }

  async createTemplate(template: TemplateRecord): Promise<void> {
    this.transaction(() => {
      this.db
        .prepare(
          // Upsert, not REPLACE. REPLACE deletes the conflicting row and
          // inserts a new one, which fires the ON DELETE CASCADE on
          // template_versions and takes the entire history with it.
          `INSERT INTO templates (name, description, content, category,
             version, is_builtin, created_at, updated_at, forked_from)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET
             description = excluded.description,
             content = excluded.content,
             category = excluded.category,
             version = excluded.version,
             is_builtin = excluded.is_builtin,
             updated_at = excluded.updated_at,
             forked_from = excluded.forked_from`,
        )
        .run(
          template.name,
          template.description,
          template.content,
          template.category,
          template.version ?? "1.0.0",
          template.is_builtin ? 1 : 0,
          template.created_at,
          template.updated_at,
          template.forked_from ? JSON.stringify(template.forked_from) : null,
        );
      this.setMemberships("template", template.name, template.projects ?? [GENERAL_PROJECT_ID]);
    });
  }

  async getTemplate(name: string): Promise<TemplateRecord | null> {
    const row = this.db.prepare("SELECT * FROM templates WHERE name = ?").get(name) as
      | Row
      | undefined;
    if (!row) return null;
    return this.toTemplate(row, this.membershipsFor("template", [name]).get(name) ?? []);
  }

  async updateTemplate(name: string, updates: Partial<TemplateRecord>): Promise<void> {
    const existing = await this.getTemplate(name);
    if (!existing) throw new Error(`Template ${name} not found`);
    await this.createTemplate({ ...existing, ...updates, name });
  }

  async listTemplates(options?: {
    project?: string;
    include_archived?: boolean;
  }): Promise<TemplateRecord[]> {
    const where: string[] = [];
    const params: Params = [];

    if (!options?.include_archived) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM memberships m WHERE m.artifact_kind = 'template'
           AND m.artifact_key = templates.name AND m.project_id = ?)`,
      );
      params.push(ARCHIVE_PROJECT_ID);
    }
    if (options?.project) {
      where.push(
        `EXISTS (SELECT 1 FROM memberships m WHERE m.artifact_kind = 'template'
           AND m.artifact_key = templates.name AND m.project_id = ?)`,
      );
      params.push(options.project);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM templates ${clause} ORDER BY name ASC`)
      .all(...params) as Row[];

    const memberships = this.membershipsFor(
      "template",
      rows.map((r) => asText(r.name)),
    );
    return rows.map((r) => this.toTemplate(r, memberships.get(asText(r.name)) ?? []));
  }

  /** Archives, for the same reason prompts do. */
  async deleteTemplate(name: string): Promise<void> {
    const exists = this.db.prepare("SELECT 1 FROM templates WHERE name = ?").get(name);
    if (!exists) throw new Error(`Template ${name} not found`);
    this.transaction(() => this.setMemberships("template", name, [ARCHIVE_PROJECT_ID]));
  }

  async saveTemplateVersion(version: TemplateVersionRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO template_versions
           (template_name, version, content, description, category, author,
            changelog_summary, version_bump_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        version.template_name,
        version.version,
        version.content,
        version.description,
        version.category,
        version.author,
        version.changelog_summary,
        version.version_bump_type,
        version.created_at,
      );
  }

  async getTemplateVersion(
    name: string,
    version: string,
  ): Promise<TemplateVersionRecord | null> {
    const row = this.db
      .prepare("SELECT * FROM template_versions WHERE template_name = ? AND version = ?")
      .get(name, version) as Row | undefined;
    return row ? (row as unknown as TemplateVersionRecord) : null;
  }

  async listTemplateVersions(name: string): Promise<TemplateVersionRecord[]> {
    // Insertion order, which is the order they happened. Sorting by the version
    // string would put 1.10.0 before 1.9.0.
    return this.db
      .prepare("SELECT * FROM template_versions WHERE template_name = ? ORDER BY rowid ASC")
      .all(name) as unknown as TemplateVersionRecord[];
  }

  // --- Projects -------------------------------------------------------------

  private toProject(row: Row): ProjectRecord {
    return {
      id: asText(row.id),
      name: asText(row.name),
      path: row.path == null ? null : String(row.path),
      is_git_repo: asBool(row.is_git_repo),
      is_reserved: asBool(row.is_reserved),
      created_at: asText(row.created_at),
      updated_at: asText(row.updated_at),
    };
  }

  async createProject(project: ProjectRecord): Promise<void> {
    this.db
      .prepare(
        // Same reason as templates, and worse here: memberships cascade off
        // projects, so a REPLACE meant renaming a project silently emptied it.
        `INSERT INTO projects (id, name, path, is_git_repo, is_reserved,
           created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           path = excluded.path,
           is_git_repo = excluded.is_git_repo,
           is_reserved = excluded.is_reserved,
           updated_at = excluded.updated_at`,
      )
      .run(
        project.id,
        project.name,
        project.path,
        project.is_git_repo ? 1 : 0,
        project.is_reserved ? 1 : 0,
        project.created_at,
        project.updated_at,
      );
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
    return row ? this.toProject(row) : null;
  }

  async updateProject(id: string, updates: Partial<ProjectRecord>): Promise<void> {
    const existing = await this.getProject(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    await this.createProject({ ...existing, ...updates, id });
  }

  async listProjects(): Promise<ProjectRecord[]> {
    // General first, Archive last, everything else alphabetical between them.
    // Ordered here so every consumer gets the same answer, rather than each
    // reimplementing it and disagreeing.
    const rows = this.db
      .prepare(
        `SELECT * FROM projects
         ORDER BY CASE id WHEN ? THEN 0 WHEN ? THEN 2 ELSE 1 END, name COLLATE NOCASE ASC`,
      )
      .all(GENERAL_PROJECT_ID, ARCHIVE_PROJECT_ID) as Row[];
    return rows.map((r) => this.toProject(r));
  }

  async deleteProject(id: string): Promise<void> {
    // Memberships go with it, by the foreign key's ON DELETE CASCADE. The route
    // has already decided where each member lands before calling this.
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }
}
