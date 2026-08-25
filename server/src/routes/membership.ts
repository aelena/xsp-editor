import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter.js";
import type { AuditLog } from "../services/audit.js";
import type { PromptRecord, PromptVersionRecord } from "../schemas/prompts.js";
import type { TemplateRecord } from "../schemas/templates.js";
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
} from "../schemas/projects.js";
import {
  addTo,
  archive,
  isArchived,
  normalise,
  removeFrom,
  unarchive,
} from "../services/membership.js";

/**
 * Membership, archiving, forking and audit, for both prompts and templates.
 *
 * The two artifact kinds get the same seven endpoints, so they are described
 * once against a small gateway rather than written twice. The differences are
 * real but few: a prompt is keyed by UUID and carries a version history, a
 * template is keyed by its name and does not.
 */

const addBodySchema = z.object({ project_id: z.string().min(1) });
const orphansQuerySchema = z.object({
  orphans: z.enum(["archive", "general"]).optional(),
});
const forkBodySchema = z.object({ name: z.string().min(1).max(200).optional() });

/** What the two kinds have in common, as far as membership is concerned. */
interface ArtifactGateway<T> {
  kind: "prompt" | "template";
  /** URL segment: "prompts" or "templates". */
  segment: string;
  /** The path parameter each kind already uses elsewhere in the API. */
  param: "id" | "name";
  get(key: string): Promise<T | null>;
  key(record: T): string;
  name(record: T): string;
  projects(record: T): string[];
  isReadOnly(record: T): boolean;
  setProjects(key: string, projects: string[]): Promise<void>;
  fork(record: T, name: string | undefined): Promise<{ key: string; name: string; created: T }>;
}

function promptGateway(storage: StorageAdapter): ArtifactGateway<PromptRecord> {
  return {
    kind: "prompt",
    segment: "prompts",
    param: "id",
    get: (key) => storage.getPrompt(key),
    key: (r) => r.id,
    name: (r) => r.name,
    projects: (r) => normalise(r.projects),
    isReadOnly: () => false,
    setProjects: (key, projects) => storage.updatePrompt(key, { projects }),

    async fork(record, name) {
      const now = new Date().toISOString();
      const id = uuidv4();
      // The version history is deliberately not copied. An independent lifecycle
      // starts at 1.0.0; what connects the two is provenance, not history.
      const version = "1.0.0";
      const created: PromptRecord = {
        ...record,
        id,
        name: name ?? `${record.name}-copy`,
        version,
        created_at: now,
        updated_at: now,
        // Forking an archived prompt yields a live copy: Archive is a state of
        // one artifact, not a property of its content. This is how a retired
        // prompt comes back into service without disturbing the record of its
        // retirement.
        projects: isArchived(record.projects)
          ? [GENERAL_PROJECT_ID]
          : normalise(record.projects),
        verification_status: "unchecked",
        forked_from: { id: record.id, name: record.name, version: record.version },
      };

      await storage.createPrompt(created);
      const versionRecord: PromptVersionRecord = {
        prompt_id: id,
        version,
        content: created.content,
        author: created.author,
        changelog_summary: `Forked from ${record.name} ${record.version}`,
        version_bump_type: "major",
        created_at: now,
      };
      await storage.saveVersion(versionRecord);

      return { key: id, name: created.name, created };
    },
  };
}

function templateGateway(storage: StorageAdapter): ArtifactGateway<TemplateRecord> {
  return {
    kind: "template",
    segment: "templates",
    param: "name",
    get: (key) => storage.getTemplate(key),
    key: (r) => r.name,
    name: (r) => r.name,
    projects: (r) => normalise(r.projects),
    // Built-ins are the shipped vocabulary. Archiving one, or taking it out of
    // General, would remove something the user did not put there and cannot get
    // back. Forking is the supported way to modify one.
    isReadOnly: (r) => r.is_builtin,
    setProjects: (key, projects) => storage.updateTemplate(key, { projects }),

    async fork(record, name) {
      const now = new Date().toISOString();
      const forkName = name ?? `${record.name}-copy`;
      if (await storage.getTemplate(forkName)) {
        throw new NameTakenError(forkName);
      }
      const created: TemplateRecord = {
        ...record,
        name: forkName,
        // A fork of a built-in is the user's own, which is the point of forking
        // one at all.
        is_builtin: false,
        created_at: now,
        updated_at: now,
        projects: isArchived(record.projects)
          ? [GENERAL_PROJECT_ID]
          : normalise(record.projects),
        forked_from: { id: record.name, name: record.name, version: "" },
      };
      await storage.createTemplate(created);
      return { key: forkName, name: forkName, created };
    },
  };
}

class NameTakenError extends Error {
  constructor(public readonly takenName: string) {
    super(`Name ${takenName} is already taken`);
  }
}

const READ_ONLY = "Built-in templates cannot be moved or archived. Fork it instead.";

function register<T>(
  app: FastifyInstance,
  storage: StorageAdapter,
  audit: AuditLog,
  gw: ArtifactGateway<T>,
): void {
  const base = `/api/v1/${gw.segment}/:${gw.param}`;

  /** The path parameter, whichever of the two names this kind uses. */
  const keyOf = (params: unknown) =>
    (params as Record<string, string>)[gw.param];

  /** Resolve the artifact or answer 404, so each handler does not repeat it. */
  const load = async (key: string) => gw.get(key);

  app.get(`${base}/projects`, async (request, reply) => {
    const key = keyOf(request.params);
    const record = await load(key);
    if (!record) return reply.status(404).send({ error: "Not found" });

    // Resolved to names as well as ids, because the labels in the editor show
    // names and the client should not have to join two lists to draw them.
    const all = await storage.listProjects();
    const ids = gw.projects(record);
    return reply.send({
      projects: ids.map((id) => {
        const project = all.find((p) => p.id === id);
        return { id, name: project?.name ?? id, is_reserved: project?.is_reserved ?? false };
      }),
      archived: isArchived(ids),
    });
  });

  app.post(`${base}/projects`, async (request, reply) => {
    const key = keyOf(request.params);
    const record = await load(key);
    if (!record) return reply.status(404).send({ error: "Not found" });
    if (gw.isReadOnly(record)) return reply.status(409).send({ error: READ_ONLY });

    const parsed = addBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "project_id is required" });
    }
    const projectId = parsed.data.project_id;

    if (!(await storage.getProject(projectId))) {
      return reply.status(404).send({ error: "Project not found" });
    }

    const before = gw.projects(record);
    const outcome = addTo(before, projectId);
    await gw.setProjects(key, outcome.after);

    // Two entries when two things happened. A trail showing only the add would
    // leave the artifact silently out of Archive with nothing saying so.
    if (outcome.unarchived) {
      await audit.record({
        kind: gw.kind,
        artifact_id: gw.key(record),
        artifact_name: gw.name(record),
        operation: "unarchived",
        project: ARCHIVE_PROJECT_ID,
        before,
        after: outcome.after,
      });
    }
    await audit.record({
      kind: gw.kind,
      artifact_id: gw.key(record),
      artifact_name: gw.name(record),
      operation: "added_to",
      project: projectId,
      before,
      after: outcome.after,
    });

    return reply.send({ projects: outcome.after, unarchived: outcome.unarchived });
  });

  app.delete(`${base}/projects/:projectId`, async (request, reply) => {
    const key = keyOf(request.params);
    const { projectId } = request.params as { projectId: string };
    const record = await load(key);
    if (!record) return reply.status(404).send({ error: "Not found" });
    if (gw.isReadOnly(record)) return reply.status(409).send({ error: READ_ONLY });

    const parsed = orphansQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "orphans must be archive or general" });
    }

    const before = gw.projects(record);
    if (!before.includes(projectId)) {
      return reply.status(404).send({ error: "Not a member of that project" });
    }

    const outcome = removeFrom(before, projectId, parsed.data.orphans);
    if (outcome.kind === "needs_choice") {
      // The server refuses to guess between archiving and General.
      return reply.status(409).send({
        error: "This is the last project the artifact belongs to",
        requires: "archive_or_general",
      });
    }

    await gw.setProjects(key, outcome.after);
    await audit.record({
      kind: gw.kind,
      artifact_id: gw.key(record),
      artifact_name: gw.name(record),
      operation: outcome.archived ? "archived" : "removed_from",
      project: projectId,
      before,
      after: outcome.after,
    });

    return reply.send({ projects: outcome.after, archived: outcome.archived });
  });

  app.post(`${base}/archive`, async (request, reply) => {
    const key = keyOf(request.params);
    const record = await load(key);
    if (!record) return reply.status(404).send({ error: "Not found" });
    if (gw.isReadOnly(record)) return reply.status(409).send({ error: READ_ONLY });

    const before = gw.projects(record);
    const after = archive();
    await gw.setProjects(key, after);
    await audit.record({
      kind: gw.kind,
      artifact_id: gw.key(record),
      artifact_name: gw.name(record),
      operation: "archived",
      project: ARCHIVE_PROJECT_ID,
      before,
      after,
      // The memberships archiving cleared, so unarchiving can restore them one
      // day. Archive being exclusive means this is the only record of them.
      detail: { cleared: before.join(",") },
    });

    return reply.send({ projects: after });
  });

  app.post(`${base}/unarchive`, async (request, reply) => {
    const key = keyOf(request.params);
    const record = await load(key);
    if (!record) return reply.status(404).send({ error: "Not found" });

    const before = gw.projects(record);
    if (!isArchived(before)) {
      return reply.status(409).send({ error: "Not archived" });
    }

    const after = unarchive(before);
    await gw.setProjects(key, after);
    await audit.record({
      kind: gw.kind,
      artifact_id: gw.key(record),
      artifact_name: gw.name(record),
      operation: "unarchived",
      project: ARCHIVE_PROJECT_ID,
      before,
      after,
    });

    return reply.send({ projects: after });
  });

  app.post(`${base}/fork`, async (request, reply) => {
    const key = keyOf(request.params);
    const record = await load(key);
    if (!record) return reply.status(404).send({ error: "Not found" });

    const parsed = forkBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid name" });
    }

    let forked;
    try {
      forked = await gw.fork(record, parsed.data.name);
    } catch (err) {
      if (err instanceof NameTakenError) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }

    // Two entries, one on each side. The trail has to read correctly from
    // whichever artifact you are looking at, and someone reading the source's
    // history needs to know a copy left.
    await audit.record({
      kind: gw.kind,
      artifact_id: gw.key(record),
      artifact_name: gw.name(record),
      operation: "forked_to",
      project: null,
      before: gw.projects(record),
      after: gw.projects(record),
      detail: { fork_id: forked.key, fork_name: forked.name },
    });
    await audit.record({
      kind: gw.kind,
      artifact_id: forked.key,
      artifact_name: forked.name,
      operation: "forked_from",
      project: null,
      before: [],
      after: gw.projects(forked.created),
      detail: { source_id: gw.key(record), source_name: gw.name(record) },
    });

    return reply.status(201).send(forked.created);
  });

  app.get(`${base}/audit`, async (request, reply) => {
    const key = keyOf(request.params);
    if (!(await load(key))) return reply.status(404).send({ error: "Not found" });
    return reply.send({ entries: await audit.read(key) });
  });
}

export function registerMembershipRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  audit: AuditLog,
): void {
  register(app, storage, audit, promptGateway(storage));
  register(app, storage, audit, templateGateway(storage));
}
