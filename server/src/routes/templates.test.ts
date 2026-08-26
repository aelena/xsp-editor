import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { GENERAL_PROJECT_ID, reservedProjects } from "../schemas/projects.js";

const NOW = "2026-08-26T10:00:00.000Z";

let app: ReturnType<typeof buildApp>;
let storage: MemoryStorageAdapter;

beforeEach(async () => {
  storage = new MemoryStorageAdapter();
  for (const project of reservedProjects(NOW)) await storage.createProject(project);
  app = buildApp(storage, createMemoryAuditLog());
});

const create = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/api/v1/templates", payload });

const valid = {
  name: "review-checklist",
  description: "A checklist for reviews",
  content: "<task>Review</task>",
  category: "review",
};

describe("POST /api/v1/templates", () => {
  it("creates one", async () => {
    const res = await create(valid);
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("review-checklist");
    expect(res.json().is_builtin).toBe(false);
  });

  it("puts it in General when no project is named", async () => {
    expect((await create(valid)).json().projects).toEqual([GENERAL_PROJECT_ID]);
  });

  it("puts it in the project it was created in", async () => {
    await storage.createProject({
      id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alpha", path: null,
      is_git_repo: false, is_reserved: false, created_at: NOW, updated_at: NOW,
    });
    const res = await create({ ...valid, project_id: "aaaaaaaa-0000-4000-8000-000000000001" });
    expect(res.json().projects).toEqual(["aaaaaaaa-0000-4000-8000-000000000001"]);
  });

  it("defaults the category rather than requiring one", async () => {
    const { category, ...withoutCategory } = valid;
    void category;
    expect((await create(withoutCategory)).json().category).toBe("general");
  });

  it("refuses a name that is not a slug", async () => {
    // Names go straight into the URL as the key, so a space or a slash there is
    // a route that cannot be addressed.
    for (const name of ["Has Spaces", "UPPER", "with/slash", "", "punctuation!"]) {
      const res = await create({ ...valid, name });
      expect(res.statusCode, name).toBe(400);
    }
  });

  it("refuses a duplicate name", async () => {
    await create(valid);
    const res = await create(valid);
    expect(res.statusCode).toBe(409);
  });

  it("refuses empty content", async () => {
    expect((await create({ ...valid, content: "" })).statusCode).toBe(400);
  });
});

describe("GET /api/v1/templates", () => {
  it("lists them by name", async () => {
    await create({ ...valid, name: "zebra" });
    await create({ ...valid, name: "alpha" });

    const res = await app.inject({ method: "GET", url: "/api/v1/templates" });
    expect(res.json().templates.map((t: { name: string }) => t.name)).toEqual(["alpha", "zebra"]);
  });

  it("filters by project", async () => {
    await storage.createProject({
      id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alpha", path: null,
      is_git_repo: false, is_reserved: false, created_at: NOW, updated_at: NOW,
    });
    await create({ ...valid, name: "in-alpha", project_id: "aaaaaaaa-0000-4000-8000-000000000001" });
    await create({ ...valid, name: "in-general" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/templates?project=aaaaaaaa-0000-4000-8000-000000000001",
    });
    expect(res.json().templates.map((t: { name: string }) => t.name)).toEqual(["in-alpha"]);
  });

  it("hides archived templates unless asked", async () => {
    await create(valid);
    await app.inject({ method: "DELETE", url: "/api/v1/templates/review-checklist" });

    expect((await app.inject({ method: "GET", url: "/api/v1/templates" })).json().templates)
      .toHaveLength(0);
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/templates?include_archived=true" }))
        .json().templates,
    ).toHaveLength(1);
  });

  it("reads include_archived=false as false", async () => {
    // z.coerce.boolean() is Boolean(value), so every non-empty string was true
    // and asking for false got you the opposite of what you asked for. Both
    // listing endpoints were doing it.
    await create(valid);
    await app.inject({ method: "DELETE", url: "/api/v1/templates/review-checklist" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/templates?include_archived=false",
    });
    expect(res.json().templates).toHaveLength(0);
  });

  it("refuses a value that is neither true nor false", async () => {
    // A caller who wrote something is trying to say something. Guessing is how
    // include_archived=no quietly becomes yes.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/templates?include_archived=maybe",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/v1/templates/:name", () => {
  it("returns one", async () => {
    await create(valid);
    const res = await app.inject({ method: "GET", url: "/api/v1/templates/review-checklist" });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe("<task>Review</task>");
  });

  it("answers 404 for one that does not exist", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/templates/nothing-here" })).statusCode,
    ).toBe(404);
  });
});

describe("PUT /api/v1/templates/:name", () => {
  it("changes the content", async () => {
    await create(valid);
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/templates/review-checklist",
      payload: { content: "<task>Changed</task>" },
    });

    expect(res.statusCode).toBe(200);
    expect((await storage.getTemplate("review-checklist"))?.content).toBe("<task>Changed</task>");
  });

  it("leaves membership alone when only the content changes", async () => {
    // An edit is not a move. This is the kind of thing that silently breaks
    // when update is implemented as delete-and-recreate.
    await create(valid);
    await app.inject({
      method: "PUT",
      url: "/api/v1/templates/review-checklist",
      payload: { description: "A new description" },
    });
    expect((await storage.getTemplate("review-checklist"))?.projects).toEqual([GENERAL_PROJECT_ID]);
  });

  it("answers 404 for one that does not exist", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/templates/nothing-here",
      payload: { content: "x" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/v1/templates/:name", () => {
  it("archives rather than destroying", async () => {
    await create(valid);
    await app.inject({ method: "DELETE", url: "/api/v1/templates/review-checklist" });

    // Still there, in Archive. Nothing in this application is destroyed.
    expect(await storage.getTemplate("review-checklist")).not.toBeNull();
  });
});
