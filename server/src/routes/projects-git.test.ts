import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { reservedProjects } from "../schemas/projects.js";

/**
 * The git handlers, against a real repository in a temporary directory.
 *
 * Real git rather than a mocked services/git.ts, because what is being checked
 * is the wiring: which project a route resolves, whether it notices a project
 * has no folder, and what it does when the folder is not a repository. A mock
 * would confirm my idea of git rather than the route's behaviour.
 */

const NOW = "2026-08-26T10:00:00.000Z";
const WORKSPACE = "aaaaaaaa-0000-4000-8000-000000000001";
const LABEL_ONLY = "bbbbbbbb-0000-4000-8000-000000000002";

let box: string;
let root: string;
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  box = await mkdtemp(join(tmpdir(), "xsp-git-"));
  root = join(box, "repo");
  await mkdir(root, { recursive: true });

  const storage = new MemoryStorageAdapter();
  for (const project of reservedProjects(NOW)) await storage.createProject(project);

  await storage.createProject({
    id: WORKSPACE, name: "Workspace", path: root,
    is_git_repo: false, is_reserved: false, created_at: NOW, updated_at: NOW,
  });
  await storage.createProject({
    id: LABEL_ONLY, name: "Just A Label", path: null,
    is_git_repo: false, is_reserved: false, created_at: NOW, updated_at: NOW,
  });

  app = buildApp(storage, createMemoryAuditLog());
});

afterEach(async () => {
  await rm(box, { recursive: true, force: true });
});

const GIT_ROUTES: [string, string, object?][] = [
  ["GET", "git/status"],
  ["GET", "git/log"],
  ["GET", "git/diff"],
  ["POST", "git/init"],
  ["POST", "git/commit", { message: "x" }],
];

describe("a project that is only a grouping", () => {
  it("answers 400 on every git route rather than crashing", async () => {
    // path is null for a project with no folder, and every one of these used to
    // hand that straight to git. One unguarded handler is a 500 on a route the
    // UI calls on a timer.
    for (const [method, suffix, payload] of GIT_ROUTES) {
      const res = await app.inject({
        method: method as "GET",
        url: `/api/v1/projects/${LABEL_ONLY}/${suffix}`,
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode, `${method} ${suffix}`).toBe(400);
      expect(res.json().error).toMatch(/no folder on disk/i);
    }
  });
});

describe("a project that does not exist", () => {
  it("answers 404 on every git route", async () => {
    for (const [method, suffix, payload] of GIT_ROUTES) {
      const res = await app.inject({
        method: method as "GET",
        url: `/api/v1/projects/cccccccc-0000-4000-8000-000000000009/${suffix}`,
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode, `${method} ${suffix}`).toBe(404);
    }
  });
});

describe("a folder that is not a repository yet", () => {
  it("refuses status, log, diff and commit", async () => {
    for (const [method, suffix, payload] of GIT_ROUTES.filter(([, s]) => s !== "git/init")) {
      const res = await app.inject({
        method: method as "GET",
        url: `/api/v1/projects/${WORKSPACE}/${suffix}`,
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode, `${method} ${suffix}`).toBe(400);
      expect(res.json().error).toMatch(/not a git repository/i);
    }
  });

  it("can be initialised, and the project remembers it", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${WORKSPACE}/git/init`,
    });

    expect(res.statusCode).toBe(200);
    const project = await app.inject({ method: "GET", url: `/api/v1/projects/${WORKSPACE}` });
    expect(project.json().is_git_repo).toBe(true);
  });
});

describe("an initialised repository", () => {
  beforeEach(async () => {
    await app.inject({ method: "POST", url: `/api/v1/projects/${WORKSPACE}/git/init` });
  });

  it("reports an untracked file in status", async () => {
    await writeFile(join(root, "new.md"), "hello", "utf-8");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${WORKSPACE}/git/status`,
    });

    expect(res.statusCode).toBe(200);
    expect((res.json().status as { path: string }[]).map((s) => s.path)).toContain("new.md");
  });

  it("reports a clean tree as empty rather than as an error", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${WORKSPACE}/git/status`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toEqual([]);
  });

  it("refuses a commit with no message", async () => {
    await writeFile(join(root, "new.md"), "hello", "utf-8");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${WORKSPACE}/git/commit`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("answers an empty log before the first commit", async () => {
    // git log on a repository with no HEAD exits non-zero, and a brand new
    // project is exactly that while the UI is already asking for the log.
    // services/git.ts turns that into an empty list, which is the right answer:
    // no commits is not an error.
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${WORKSPACE}/git/log`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().log).toEqual([]);
  });

  it("answers a diff on a clean tree without failing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${WORKSPACE}/git/diff`,
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().diff).toBe("string");
  });
});
