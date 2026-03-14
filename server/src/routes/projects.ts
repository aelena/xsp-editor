import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createProjectSchema, updateProjectSchema, type ProjectRecord } from "../schemas/projects.js";
import { isGitRepo, gitInit, gitStatus, gitAdd, gitCommit, gitLog, gitDiff } from "../services/git.js";

const execFileAsync = promisify(execFile);

// In-memory project store (simple, no adapter needed)
const projects = new Map<string, ProjectRecord>();

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

  // Browse: open native OS folder picker dialog
  app.post("/api/v1/browse-folder", async (_request, reply) => {
    const platform = process.platform;

    try {
      if (platform === "win32") {
        // Shell.Application.BrowseForFolder (avoids STA/WinForms threading issues when spawned from Node)
        const script = `
$app = New-Object -ComObject Shell.Application
$folder = $app.BrowseForFolder(0, "Select project folder", 0, 0)
if ($folder -and $folder.Self -and $folder.Self.Path) {
  Write-Output $folder.Self.Path
}`;
        const { stdout } = await execFileAsync("powershell", [
          "-NoProfile",
          "-ExecutionPolicy", "Bypass",
          "-Command",
          script,
        ], { timeout: 60000 });
        const selected = stdout.trim();
        if (selected) {
          return reply.send({ path: selected });
        }
        return reply.send({ path: null, cancelled: true });
      } else if (platform === "darwin") {
        // macOS: osascript
        const { stdout } = await execFileAsync("osascript", [
          "-e",
          'choose folder with prompt "Select project folder"',
        ], { timeout: 60000 });
        const selected = stdout.trim().replace(/^alias /, "");
        if (selected) {
          // Convert macOS alias path to POSIX
          const { stdout: posixPath } = await execFileAsync("osascript", [
            "-e",
            `POSIX path of "${selected}"`,
          ]);
          return reply.send({ path: posixPath.trim() });
        }
        return reply.send({ path: null, cancelled: true });
      } else {
        // Linux: zenity if available
        try {
          const { stdout } = await execFileAsync("zenity", [
            "--file-selection",
            "--directory",
            "--title=Select project folder",
          ], { timeout: 60000 });
          const selected = stdout.trim();
          if (selected) {
            return reply.send({ path: selected });
          }
        } catch {
          // zenity not available or cancelled
        }
        return reply.send({ path: null, cancelled: true });
      }
    } catch {
      // Dialog was cancelled or errored
      return reply.send({ path: null, cancelled: true });
    }
  });

  // Browse: list directory contents (fallback for browsing)
  app.get("/api/v1/browse-folder", async (request, reply) => {
    const { path: dirPath } = request.query as { path?: string };
    if (!dirPath) {
      return reply.status(400).send({ error: "path query param is required" });
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          path: join(dirPath, e.name).replace(/\\/g, "/"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return reply.send({ current: dirPath, directories: dirs });
    } catch {
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
