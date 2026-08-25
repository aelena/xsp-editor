import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import {
  createProjectSchema,
  updateProjectSchema,
  deleteProjectQuerySchema,
  isReservedProjectId,
  type ProjectRecord,
} from "../schemas/projects.js";
import { isGitRepo, gitInit, gitStatus, gitAdd, gitCommit, gitLog, gitDiff } from "../services/git.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { AuditLog } from "../services/audit.js";
import { afterProjectDeleted, normalise } from "../services/membership.js";
import { collectAll } from "../storage/collect.js";

/** Git operations need a folder. A project that is only a grouping has none. */
const NOT_A_WORKSPACE = "This project has no folder on disk";

export function registerProjectRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  audit: AuditLog,
): void {
  /**
   * Every member of a project, prompts and templates alike, so the callers that
   * act on all of them do not each reimplement the pair of queries.
   */
  const membersOf = async (projectId: string) => {
    const prompts = await collectAll((page, limit) =>
      storage
        .listPrompts({ page, limit, project: projectId, include_archived: true })
        .then((r) => ({ items: r.prompts, total: r.total, page: r.page, limit: r.limit })),
    );
    const templates = await storage.listTemplates({
      project: projectId,
      include_archived: true,
    });
    return { prompts, templates };
  };

  /** The members that would be left with no project at all if this one went. */
  const orphansOf = async (projectId: string) => {
    const { prompts, templates } = await membersOf(projectId);
    const orphaned = (projects: string[]) =>
      normalise(projects).filter((p) => p !== projectId).length === 0;
    return {
      prompts: prompts.filter((p) => orphaned(p.projects)),
      templates: templates.filter((t) => orphaned(t.projects)),
    };
  };

  app.get("/api/v1/projects", async (_request, reply) => {
    return reply.send({ projects: await storage.listProjects() });
  });

  app.post("/api/v1/projects", async (request, reply) => {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { name, path } = parseResult.data;

    // A path is optional now, because a project can be nothing but a grouping.
    // When one is given it still has to exist: a workspace pointing nowhere
    // fails later and further from the cause.
    if (path && !existsSync(path)) {
      return reply.status(400).send({ error: "Directory does not exist" });
    }

    const existing = await storage.listProjects();
    if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      // Names are what the tree and the membership labels show, so two projects
      // sharing one produces a UI that cannot be read.
      return reply.status(409).send({ error: "A project with that name exists" });
    }

    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: uuidv4(),
      name,
      path: path ?? null,
      is_git_repo: path ? await isGitRepo(path) : false,
      is_reserved: false,
      created_at: now,
      updated_at: now,
    };

    await storage.createProject(project);
    return reply.status(201).send(project);
  });

  /**
   * Every project with the prompts and templates hanging off it. One level:
   * there are no sub-projects and no nesting.
   *
   * Built here rather than in the client, which would otherwise fetch every
   * prompt and every template and regroup them on each render, which is the
   * same work done further from the data.
   *
   * Registered before /:id so that "tree" is not read as a project id.
   */
  app.get("/api/v1/projects/tree", async (_request, reply) => {
    const projects = await storage.listProjects();
    const tree = [];

    for (const project of projects) {
      const { prompts, templates } = await membersOf(project.id);
      tree.push({
        project,
        prompts: prompts.map((p) => ({
          id: p.id,
          name: p.name,
          version: p.version,
          verification_status: p.verification_status,
        })),
        templates: templates.map((t) => ({
          name: t.name,
          category: t.category,
          is_builtin: t.is_builtin,
        })),
      });
    }

    return reply.send({ tree });
  });

  app.get("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.send(project);
  });

  app.put("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await storage.getProject(id);
    if (!existing) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (existing.is_reserved) {
      // General and Archive are part of the model, not user data. Renaming
      // General leaves the UI explaining a concept by a name nothing else uses.
      return reply.status(409).send({ error: "Reserved projects cannot be changed" });
    }

    const parseResult = updateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const updates = parseResult.data;
    if (updates.path && !existsSync(updates.path)) {
      return reply.status(400).send({ error: "Directory does not exist" });
    }

    const path = updates.path ?? existing.path;
    const updated: ProjectRecord = {
      ...existing,
      name: updates.name || existing.name,
      path,
      is_git_repo: path ? await isGitRepo(path) : false,
      updated_at: new Date().toISOString(),
    };

    await storage.updateProject(id, updated);
    return reply.send(updated);
  });

  /**
   * How many members would be left with no project if this one were deleted.
   *
   * The confirmation dialog needs this number before it can ask a sensible
   * question. When it is zero the question does not need asking, and when it is
   * not, "four of nine prompts have no other project" is a choice someone can
   * actually make.
   */
  app.get("/api/v1/projects/:id/orphan-count", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }

    const orphans = await orphansOf(id);
    const members = await membersOf(id);
    return reply.send({
      orphan_count: orphans.prompts.length + orphans.templates.length,
      member_count: members.prompts.length + members.templates.length,
    });
  });

  /**
   * Delete a project, moving its members rather than destroying them.
   *
   * Each member loses exactly this one membership. A member with another home is
   * otherwise untouched, which is the rule that makes "prompts move back to
   * General" and "prompts in other projects are unaffected" both true at once.
   * The `orphans` answer only reaches the members that would be left with
   * nothing.
   */
  app.delete("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (isReservedProjectId(id) || project.is_reserved) {
      return reply.status(409).send({ error: "Reserved projects cannot be deleted" });
    }

    const queryResult = deleteProjectQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({ error: "orphans must be archive or general" });
    }
    const { orphans } = queryResult.data;

    const { prompts, templates } = await membersOf(id);
    const orphaned = await orphansOf(id);
    const orphanCount = orphaned.prompts.length + orphaned.templates.length;

    if (!orphans && orphanCount > 0) {
      // The server refuses to guess. Without this, a client that forgets a
      // query parameter archives things silently.
      return reply.status(409).send({
        error: "Deleting this project would leave members with no project",
        orphan_count: orphanCount,
        requires: "orphans=archive|general",
      });
    }

    const choice = orphans ?? "general";

    for (const prompt of prompts) {
      const before = normalise(prompt.projects);
      const { after, archived } = afterProjectDeleted(before, id, choice);
      await storage.updatePrompt(prompt.id, { projects: after });
      await audit.record({
        kind: "prompt",
        artifact_id: prompt.id,
        artifact_name: prompt.name,
        operation: archived ? "archived" : "removed_from",
        project: id,
        before,
        after,
        detail: { project_name: project.name, reason: "project_deleted" },
      });
    }

    for (const template of templates) {
      const before = normalise(template.projects);
      const { after, archived } = afterProjectDeleted(before, id, choice);
      await storage.updateTemplate(template.name, { projects: after });
      await audit.record({
        kind: "template",
        artifact_id: template.name,
        artifact_name: template.name,
        operation: archived ? "archived" : "removed_from",
        project: id,
        before,
        after,
        detail: { project_name: project.name, reason: "project_deleted" },
      });
    }

    await storage.deleteProject(id);
    return reply.status(204).send();
  });

  /**
   * List the directories inside a path, so the client can offer a folder picker
   * of its own.
   *
   * This replaced a handler that shell-executed the platform's native dialog:
   * PowerShell's BrowseForFolder on Windows, osascript on macOS, zenity on
   * Linux. That approach cannot work from a server process. The dialog opens on
   * whatever desktop session the server happens to be attached to, with no
   * owner window, so in practice it appeared behind everything or nowhere at
   * all, and the request sat blocked for up to sixty seconds while the button
   * showed an ellipsis. It also could not be tested.
   *
   * It is deliberately not restricted to registered project paths. Choosing the
   * folder for a *new* project is exactly the case where no registration exists
   * yet, which is why the old restriction made the fallback useless.
   *
   * What it exposes is directory names, to whoever can reach this port. For a
   * tool that exists to open local projects that is the feature, and on
   * localhost the caller is the user. Reading file *contents* stays restricted
   * to registered projects, which is where the useful boundary is. If this ever
   * listens on anything but loopback, the API token has to become mandatory.
   */
  app.get("/api/v1/browse-folder", async (request, reply) => {
    const { path: requested } = request.query as { path?: string };

    // No path means "start somewhere the user recognises".
    const target = resolve(requested && requested.trim() ? requested : homedir());
    const parent = dirname(target);

    try {
      const entries = await readdir(target, { withFileTypes: true });
      const directories = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          path: join(target, e.name).replace(/\\/g, "/"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return reply.send({
        current: target.replace(/\\/g, "/"),
        // Null at the root, so the client knows there is no "up" to offer
        // rather than having to compare strings to work it out.
        parent: parent === target ? null : parent.replace(/\\/g, "/"),
        directories,
      });
    } catch (err) {
      request.log.warn({ err, target }, "could not list directory");
      return reply.status(400).send({ error: "Cannot read directory" });
    }
  });

  // Git: init repo
  app.post("/api/v1/projects/:id/git/init", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (!project.path) {
      return reply.status(400).send({ error: NOT_A_WORKSPACE });
    }

    await gitInit(project.path);
    await storage.updateProject(id, { is_git_repo: true });
    return reply.send({ message: "Git repository initialized" });
  });

  // Git: status
  app.get("/api/v1/projects/:id/git/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (!project.path) {
      return reply.status(400).send({ error: NOT_A_WORKSPACE });
    }
    if (!project.is_git_repo) {
      return reply.status(400).send({ error: "Not a git repository" });
    }

    const status = await gitStatus(project.path);
    return reply.send({ status });
  });

  // Git: add + commit
  app.post("/api/v1/projects/:id/git/commit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (!project.path) {
      return reply.status(400).send({ error: NOT_A_WORKSPACE });
    }
    if (!project.is_git_repo) {
      return reply.status(400).send({ error: "Not a git repository" });
    }

    const { message, files } = request.body as {
      message: string;
      files?: string[];
    };
    if (!message) {
      return reply.status(400).send({ error: "Commit message is required" });
    }

    // Stage files (all if none specified)
    await gitAdd(project.path, files || ["."]);
    const output = await gitCommit(project.path, message);
    return reply.send({ message: "Committed", output });
  });

  // Git: log
  app.get("/api/v1/projects/:id/git/log", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (!project.path) {
      return reply.status(400).send({ error: NOT_A_WORKSPACE });
    }
    if (!project.is_git_repo) {
      return reply.status(400).send({ error: "Not a git repository" });
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const log = await gitLog(project.path, limit);
    return reply.send({ log });
  });

  // Git: diff
  app.get("/api/v1/projects/:id/git/diff", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await storage.getProject(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (!project.path) {
      return reply.status(400).send({ error: NOT_A_WORKSPACE });
    }
    if (!project.is_git_repo) {
      return reply.status(400).send({ error: "Not a git repository" });
    }

    const query = request.query as { file?: string };
    const diff = await gitDiff(project.path, query.file);
    return reply.send({ diff });
  });
}
