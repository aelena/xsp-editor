import type { FastifyInstance } from "fastify";
import { readdir, readFile, writeFile, mkdir, unlink, stat, rename } from "node:fs/promises";
import { join, resolve, relative, extname, dirname } from "node:path";
import { existsSync } from "node:fs";
import { isRegisteredProjectPath } from "./projects.js";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  extension?: string;
}

async function listFilesRecursive(
  dirPath: string,
  basePath: string,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  try {
    const items = await readdir(dirPath, { withFileTypes: true });
    for (const item of items) {
      // Skip hidden dirs and node_modules
      if (item.name.startsWith(".") || item.name === "node_modules") continue;

      const fullPath = join(dirPath, item.name);
      const relPath = relative(basePath, fullPath).replace(/\\/g, "/");

      if (item.isDirectory()) {
        entries.push({ name: item.name, path: relPath, type: "directory" });
        const children = await listFilesRecursive(fullPath, basePath);
        entries.push(...children);
      } else {
        entries.push({
          name: item.name,
          path: relPath,
          type: "file",
          extension: extname(item.name),
        });
      }
    }
  } catch {
    // Directory might not exist or be readable
  }

  return entries;
}

// Resolve a file path within a project directory, rejecting traversal attempts.
// Uses path.resolve() + path.relative() which handles symlinks, double-dots,
// and Unicode normalization more reliably than string prefix matching.
function resolveProjectPath(projectPath: string, filePath: string): string {
  const base = resolve(projectPath);
  const resolved = resolve(base, filePath);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || resolve(base, rel) !== resolved) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

export function registerFileRoutes(app: FastifyInstance): void {
  // List files in a project directory
  app.get("/api/v1/files", async (request, reply) => {
    const { projectPath } = request.query as { projectPath: string };
    if (!projectPath) {
      return reply.status(400).send({ error: "projectPath query param required" });
    }
    if (!isRegisteredProjectPath(projectPath)) {
      return reply.status(403).send({ error: "Project path is not registered" });
    }
    if (!existsSync(projectPath)) {
      return reply.status(400).send({ error: "Directory does not exist" });
    }

    const files = await listFilesRecursive(projectPath, projectPath);
    return reply.send({ files });
  });

  // Read a file
  app.get("/api/v1/files/read", async (request, reply) => {
    const { projectPath, filePath } = request.query as {
      projectPath: string;
      filePath: string;
    };
    if (!projectPath || !filePath) {
      return reply.status(400).send({
        error: "projectPath and filePath query params required",
      });
    }
    if (!isRegisteredProjectPath(projectPath)) {
      return reply.status(403).send({ error: "Project path is not registered" });
    }

    try {
      const fullPath = resolveProjectPath(projectPath, filePath);
      const content = await readFile(fullPath, "utf-8");
      const stats = await stat(fullPath);
      return reply.send({
        content,
        path: filePath,
        size: stats.size,
        modified_at: stats.mtime.toISOString(),
      });
    } catch (err) {
      return reply.status(404).send({ error: "File not found" });
    }
  });

  // Write/create a file
  app.put("/api/v1/files/write", async (request, reply) => {
    const { projectPath, filePath } = request.query as {
      projectPath: string;
      filePath: string;
    };
    if (!projectPath || !filePath) {
      return reply.status(400).send({
        error: "projectPath and filePath query params required",
      });
    }
    if (!isRegisteredProjectPath(projectPath)) {
      return reply.status(403).send({ error: "Project path is not registered" });
    }

    const { content } = request.body as { content: string };
    if (content === undefined) {
      return reply.status(400).send({ error: "content is required in body" });
    }

    try {
      const fullPath = resolveProjectPath(projectPath, filePath);
      // Ensure parent directory exists
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(fullPath, content, "utf-8");
      return reply.send({ path: filePath, message: "File saved" });
    } catch (err) {
      return reply.status(500).send({
        error: "Failed to write file",
      });
    }
  });

  // Delete a file
  app.delete("/api/v1/files", async (request, reply) => {
    const { projectPath, filePath } = request.query as {
      projectPath: string;
      filePath: string;
    };
    if (!projectPath || !filePath) {
      return reply.status(400).send({
        error: "projectPath and filePath query params required",
      });
    }
    if (!isRegisteredProjectPath(projectPath)) {
      return reply.status(403).send({ error: "Project path is not registered" });
    }

    try {
      const fullPath = resolveProjectPath(projectPath, filePath);
      await unlink(fullPath);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }
  });

  // Rename/move a file
  app.post("/api/v1/files/rename", async (request, reply) => {
    const { projectPath } = request.query as { projectPath: string };
    const { oldPath, newPath } = request.body as {
      oldPath: string;
      newPath: string;
    };
    if (!projectPath || !oldPath || !newPath) {
      return reply.status(400).send({
        error: "projectPath query param and oldPath/newPath body fields required",
      });
    }
    if (!isRegisteredProjectPath(projectPath)) {
      return reply.status(403).send({ error: "Project path is not registered" });
    }

    try {
      const fullOld = resolveProjectPath(projectPath, oldPath);
      const fullNew = resolveProjectPath(projectPath, newPath);
      const dir = dirname(fullNew);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await rename(fullOld, fullNew);
      return reply.send({ oldPath, newPath, message: "File renamed" });
    } catch (err) {
      return reply.status(500).send({
        error: "Failed to rename file",
      });
    }
  });
}
