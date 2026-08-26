import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { createMemoryAuditLog } from "../services/audit.js";

/**
 * The file routes, which are the widest boundary in the application: they read
 * and write real paths on the machine running the server. They had 11% coverage,
 * which for the one place that touches the filesystem is the wrong 11%.
 *
 * Everything here runs against a real temporary directory rather than a mocked
 * fs. Path traversal is a property of how the operating system resolves paths,
 * and a mock would be asserting against my own idea of that rather than the
 * thing being defended.
 */

let root: string;
let outside: string;
let app: ReturnType<typeof buildApp>;
let storage: MemoryStorageAdapter;

const NOW = "2026-08-26T10:00:00.000Z";

beforeEach(async () => {
  const box = await mkdtemp(join(tmpdir(), "xsp-files-"));
  root = join(box, "project");
  outside = join(box, "outside");
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "secret.txt"), "not yours", "utf-8");

  storage = new MemoryStorageAdapter();
  await storage.createProject({
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    name: "Workspace",
    path: root,
    is_git_repo: false,
    is_reserved: false,
    created_at: NOW,
    updated_at: NOW,
  });
  app = buildApp(storage, createMemoryAuditLog());
});

afterEach(async () => {
  await rm(join(root, ".."), { recursive: true, force: true });
});

const q = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();

describe("listing files", () => {
  it("lists what is in the project, recursively", async () => {
    await writeFile(join(root, "top.md"), "x", "utf-8");
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "nested", "inner.xml"), "y", "utf-8");

    const res = await app.inject({ method: "GET", url: `/api/v1/files?${q({ projectPath: root })}` });

    expect(res.statusCode).toBe(200);
    const paths = (res.json().files as { path: string }[]).map((f) => f.path);
    expect(paths).toContain("top.md");
    expect(paths).toContain("nested");
    expect(paths).toContain("nested/inner.xml");
  });

  it("uses forward slashes even on Windows", async () => {
    // These paths go to the client, into a URL, and come back. Mixed separators
    // in that round trip produce paths that look right and do not match.
    await mkdir(join(root, "a", "b"), { recursive: true });
    await writeFile(join(root, "a", "b", "deep.md"), "x", "utf-8");

    const res = await app.inject({ method: "GET", url: `/api/v1/files?${q({ projectPath: root })}` });
    for (const file of res.json().files as { path: string }[]) {
      expect(file.path).not.toContain("\\");
    }
  });

  it("hides dotted directories and node_modules", async () => {
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "HEAD"), "ref", "utf-8");
    await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
    await writeFile(join(root, "node_modules", "left-pad", "index.js"), "x", "utf-8");

    const res = await app.inject({ method: "GET", url: `/api/v1/files?${q({ projectPath: root })}` });
    const paths = (res.json().files as { path: string }[]).map((f) => f.path);

    expect(paths.some((p) => p.startsWith(".git"))).toBe(false);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("reports the extension, which is how the client picks an editor mode", async () => {
    await writeFile(join(root, "prompt.xml"), "x", "utf-8");
    const res = await app.inject({ method: "GET", url: `/api/v1/files?${q({ projectPath: root })}` });
    const entry = (res.json().files as { name: string; extension?: string }[]).find(
      (f) => f.name === "prompt.xml",
    );
    expect(entry?.extension).toBe(".xml");
  });

  it("needs a projectPath", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/files" })).statusCode).toBe(400);
  });

  it("answers 400 for a registered path that has since been deleted", async () => {
    await rm(root, { recursive: true, force: true });
    const res = await app.inject({ method: "GET", url: `/api/v1/files?${q({ projectPath: root })}` });
    expect(res.statusCode).toBe(400);
  });
});

describe("the registered-project boundary", () => {
  it("refuses to list a directory nobody registered", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files?${q({ projectPath: outside })}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses to read, write, delete or rename outside a registered project", async () => {
    // Every entry point, not just the read. One unguarded verb is the whole
    // boundary.
    const cases: [string, string, object?][] = [
      ["GET", `/api/v1/files/read?${q({ projectPath: outside, filePath: "secret.txt" })}`],
      ["PUT", `/api/v1/files/write?${q({ projectPath: outside, filePath: "new.txt" })}`, { content: "x" }],
      ["DELETE", `/api/v1/files?${q({ projectPath: outside, filePath: "secret.txt" })}`],
      ["POST", `/api/v1/files/rename?${q({ projectPath: outside })}`, { oldPath: "secret.txt", newPath: "b.txt" }],
    ];

    for (const [method, url, payload] of cases) {
      const res = await app.inject({ method: method as "GET", url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    // And the file it was after is untouched.
    expect(await readFile(join(outside, "secret.txt"), "utf-8")).toBe("not yours");
  });

  it("grants nothing for a project that is only a grouping", async () => {
    // A project with no folder has no files, and must not be usable to reach
    // anything by passing its name.
    await storage.createProject({
      id: "bbbbbbbb-0000-4000-8000-000000000001",
      name: "Just A Label",
      path: null,
      is_git_repo: false,
      is_reserved: false,
      created_at: NOW,
      updated_at: NOW,
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files?${q({ projectPath: "" })}`,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("path traversal", () => {
  it("refuses to climb out with ..", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({ projectPath: root, filePath: "../outside/secret.txt" })}`,
    });
    // Rejected by the resolver, which reports it as not found rather than
    // confirming that something is up there.
    expect(res.statusCode).toBe(404);
  });

  it("refuses a deeply nested climb", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({
        projectPath: root,
        filePath: "a/b/c/../../../../outside/secret.txt",
      })}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("refuses an absolute path", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({ projectPath: root, filePath: join(outside, "secret.txt") })}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("refuses to write outside the project", async () => {
    // The one that matters most: a traversal on read leaks, a traversal on
    // write lands a file wherever the attacker chose.
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/files/write?${q({ projectPath: root, filePath: "../outside/planted.txt" })}`,
      payload: { content: "planted" },
    });

    expect(res.statusCode).toBe(500);
    expect(existsSync(join(outside, "planted.txt"))).toBe(false);
  });

  it("refuses to rename out of the project", async () => {
    await writeFile(join(root, "here.txt"), "mine", "utf-8");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/files/rename?${q({ projectPath: root })}`,
      payload: { oldPath: "here.txt", newPath: "../outside/moved.txt" },
    });

    expect(res.statusCode).toBe(500);
    expect(existsSync(join(outside, "moved.txt"))).toBe(false);
    expect(existsSync(join(root, "here.txt"))).toBe(true);
  });

  it("allows a path that merely contains dots", async () => {
    // The guard has to stop traversal without breaking ordinary names.
    await writeFile(join(root, "my..file.md"), "fine", "utf-8");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({ projectPath: root, filePath: "my..file.md" })}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe("fine");
  });
});

describe("reading", () => {
  it("returns the content with its size and modification time", async () => {
    await writeFile(join(root, "note.md"), "hello", "utf-8");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({ projectPath: root, filePath: "note.md" })}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe("hello");
    expect(res.json().size).toBe(5);
    expect(Date.parse(res.json().modified_at)).not.toBeNaN();
  });

  it("answers 404 for a file that is not there", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({ projectPath: root, filePath: "nope.md" })}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("needs both parameters", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({ projectPath: root })}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("round-trips content that is not ASCII", async () => {
    const content = "acentos, emoji 🔐, y <xml attr=\"ñ\"/>";
    await writeFile(join(root, "utf8.md"), content, "utf-8");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/read?${q({ projectPath: root, filePath: "utf8.md" })}`,
    });
    expect(res.json().content).toBe(content);
  });
});

describe("writing", () => {
  it("creates a file", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/files/write?${q({ projectPath: root, filePath: "new.md" })}`,
      payload: { content: "written" },
    });

    expect(res.statusCode).toBe(200);
    expect(await readFile(join(root, "new.md"), "utf-8")).toBe("written");
  });

  it("overwrites an existing one", async () => {
    await writeFile(join(root, "existing.md"), "before", "utf-8");
    await app.inject({
      method: "PUT",
      url: `/api/v1/files/write?${q({ projectPath: root, filePath: "existing.md" })}`,
      payload: { content: "after" },
    });
    expect(await readFile(join(root, "existing.md"), "utf-8")).toBe("after");
  });

  it("creates the parent directories", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v1/files/write?${q({ projectPath: root, filePath: "a/b/c/deep.md" })}`,
      payload: { content: "deep" },
    });
    expect(await readFile(join(root, "a", "b", "c", "deep.md"), "utf-8")).toBe("deep");
  });

  it("accepts an empty file", async () => {
    // Distinct from a missing body, which is the next test. Emptying a file is
    // a legitimate edit.
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/files/write?${q({ projectPath: root, filePath: "empty.md" })}`,
      payload: { content: "" },
    });
    expect(res.statusCode).toBe(200);
    expect(await readFile(join(root, "empty.md"), "utf-8")).toBe("");
  });

  it("refuses a body with no content field", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/files/write?${q({ projectPath: root, filePath: "x.md" })}`,
      payload: { something_else: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("deleting", () => {
  it("removes the file", async () => {
    await writeFile(join(root, "doomed.md"), "x", "utf-8");
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/files?${q({ projectPath: root, filePath: "doomed.md" })}`,
    });

    expect(res.statusCode).toBe(204);
    expect(existsSync(join(root, "doomed.md"))).toBe(false);
  });

  it("answers 404 for one that is already gone", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/files?${q({ projectPath: root, filePath: "never.md" })}`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("renaming", () => {
  it("moves the file and keeps the content", async () => {
    await writeFile(join(root, "before.md"), "same content", "utf-8");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/files/rename?${q({ projectPath: root })}`,
      payload: { oldPath: "before.md", newPath: "after.md" },
    });

    expect(res.statusCode).toBe(200);
    expect(existsSync(join(root, "before.md"))).toBe(false);
    expect(await readFile(join(root, "after.md"), "utf-8")).toBe("same content");
  });

  it("moves into a directory that does not exist yet", async () => {
    await writeFile(join(root, "loose.md"), "x", "utf-8");
    await app.inject({
      method: "POST",
      url: `/api/v1/files/rename?${q({ projectPath: root })}`,
      payload: { oldPath: "loose.md", newPath: "sorted/loose.md" },
    });
    expect(existsSync(join(root, "sorted", "loose.md"))).toBe(true);
  });

  it("needs all three of projectPath, oldPath and newPath", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/files/rename?${q({ projectPath: root })}`,
      payload: { oldPath: "a.md" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("fails without destroying anything when the source is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/files/rename?${q({ projectPath: root })}`,
      payload: { oldPath: "ghost.md", newPath: "somewhere.md" },
    });
    expect(res.statusCode).toBe(500);
    expect(existsSync(join(root, "somewhere.md"))).toBe(false);
  });
});
