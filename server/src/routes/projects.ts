import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createProjectSchema, updateProjectSchema, type ProjectRecord } from "../schemas/projects.js";
import { isGitRepo, gitInit, gitStatus, gitAdd, gitCommit, gitLog, gitDiff } from "../services/git.js";

// In-memory project store (simple, no adapter needed)
export const projects = new Map<string, ProjectRecord>();

/** Check whether a given path is a registered project root. */
export function isRegisteredProjectPath(projectPath: string): boolean {
  for (const p of projects.values()) {
    if (p.path === projectPath) return true;
  }
  return false;
}

export function registerProjectRoutes(app: FastifyInstance): void {
  // List all projects
  app.get("/api/v1/projects", async (_request, reply) => {
    const list = Array.from(projects.values()).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    return reply.send({ projects: list });
  });

  // Create a project
  app.post("/api/v1/projects", async (request, reply) => {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { name, path } = parseResult.data;

    if (!existsSync(path)) {
      return reply.status(400).send({ error: "Directory does not exist" });
    }

    const now = new Date().toISOString();
    const is_git = await isGitRepo(path);

    const project: ProjectRecord = {
      id: uuidv4(),
      name,
      path,
      is_git_repo: is_git,
      created_at: now,
      updated_at: now,
    };

    projects.set(project.id, project);
    return reply.status(201).send(project);
  });

  // Get a project
  app.get("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = projects.get(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.send(project);
  });

  // Update a project
  app.put("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = projects.get(id);
    if (!existing) {
      return reply.status(404).send({ error: "Project not found" });
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

    const updatedPath = updates.path || existing.path;
    const is_git = await isGitRepo(updatedPath);

    const updated: ProjectRecord = {
      ...existing,
      name: updates.name || existing.name,
      path: updatedPath,
      is_git_repo: is_git,
      updated_at: new Date().toISOString(),
    };

    projects.set(id, updated);
    return reply.send(updated);
  });

  // Delete a project
  app.delete("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!projects.has(id)) {
      return reply.status(404).send({ error: "Project not found" });
    }
    projects.delete(id);
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
    const project = projects.get(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }

    await gitInit(project.path);
    project.is_git_repo = true;
    projects.set(id, project);
    return reply.send({ message: "Git repository initialized" });
  });

  // Git: status
  app.get("/api/v1/projects/:id/git/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = projects.get(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
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
    const project = projects.get(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
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
    const project = projects.get(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
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
    const project = projects.get(id);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    if (!project.is_git_repo) {
      return reply.status(400).send({ error: "Not a git repository" });
    }

    const query = request.query as { file?: string };
    const diff = await gitDiff(project.path, query.file);
    return reply.send({ diff });
  });
}
