import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { reservedProjects } from "../schemas/projects.js";

/**
 * Templates get the version history prompts already had.
 *
 * The reason it matters more for a template than for a prompt: a template is
 * shared by definition, so an edit to one changes every prompt started from it
 * afterwards, and until now that edit was unrecoverable.
 */

const NOW = "2026-08-26T10:00:00.000Z";

let app: ReturnType<typeof buildApp>;
let storage: MemoryStorageAdapter;

beforeEach(async () => {
  storage = new MemoryStorageAdapter();
  for (const project of reservedProjects(NOW)) await storage.createProject(project);
  app = buildApp(storage, createMemoryAuditLog());
});

const VALID = {
  name: "review-checklist",
  description: "A checklist",
  content: "<task>Review</task>",
  category: "review",
};

const create = () =>
  app.inject({ method: "POST", url: "/api/v1/templates", payload: VALID });

const update = (payload: Record<string, unknown>) =>
  app.inject({ method: "PUT", url: `/api/v1/templates/${VALID.name}`, payload });

const versions = async () =>
  (await app.inject({ method: "GET", url: `/api/v1/templates/${VALID.name}/versions` })).json()
    .versions as { version: string; changelog_summary: string; content: string }[];

describe("creating", () => {
  it("starts at 1.0.0", async () => {
    expect((await create()).json().version).toBe("1.0.0");
  });

  it("records the first version, so the history starts complete", async () => {
    // Beginning the history at the first edit means the original is the one
    // version you cannot get back.
    await create();
    const history = await versions();

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      version: "1.0.0",
      changelog_summary: "Initial version",
      content: "<task>Review</task>",
    });
  });
});

describe("updating", () => {
  beforeEach(async () => {
    await create();
  });

  it("bumps the patch by default", async () => {
    const res = await update({ content: "<task>Changed</task>" });
    expect(res.json().version).toBe("1.0.1");
  });

  it("takes the bump it is given", async () => {
    expect((await update({ content: "a", version_bump: "minor" })).json().version).toBe("1.1.0");
    expect((await update({ content: "b", version_bump: "major" })).json().version).toBe("2.0.0");
  });

  it("adds a version to the history with its summary", async () => {
    await update({ content: "<task>Changed</task>", changelog_summary: "Tightened the wording" });

    const history = await versions();
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      version: "1.0.1",
      changelog_summary: "Tightened the wording",
      content: "<task>Changed</task>",
    });
  });

  it("versions a change to the description or the category too", async () => {
    // A version captures what the template is, not only its body. Renaming its
    // category is a change someone may want to undo.
    await update({ description: "A different description" });
    await update({ category: "safety" });

    expect(await versions()).toHaveLength(3);
  });

  it("does not version a request that changes nothing", async () => {
    // Saving a form without editing anything should not produce 1.0.1 of the
    // same template. Version numbers that move for no reason stop being read.
    await update({ content: VALID.content, description: VALID.description });

    expect(await versions()).toHaveLength(1);
    const current = await app.inject({ method: "GET", url: `/api/v1/templates/${VALID.name}` });
    expect(current.json().version).toBe("1.0.0");
  });

  it("keeps the versions in the order they happened", async () => {
    // Nine then ten, which sorting the version strings would reverse.
    for (let i = 0; i < 10; i += 1) await update({ content: `v${i}` });
    const history = await versions();

    expect(history.at(-2)?.version).toBe("1.0.9");
    expect(history.at(-1)?.version).toBe("1.0.10");
  });

  it("refuses to edit a built-in", async () => {
    // Editing one in place means an upgrade either clobbers the edit or keeps
    // the old copy, and neither is something to find out later.
    await storage.createTemplate({
      name: "shipped", description: "d", content: "<task/>", category: "general",
      version: "1.0.0", is_builtin: true, created_at: NOW, updated_at: NOW, projects: [],
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/templates/shipped",
      payload: { content: "mine now" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Fork it/);
  });
});

describe("reading one version", () => {
  it("returns it", async () => {
    await create();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/templates/${VALID.name}/versions/1.0.0`,
    });
    expect(res.json().content).toBe("<task>Review</task>");
  });

  it("answers 404 for one that does not exist", async () => {
    await create();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/templates/${VALID.name}/versions/9.9.9`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("answers 404 for a template that does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/templates/nothing-here/versions",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("rolling back", () => {
  beforeEach(async () => {
    await create();
    await update({ content: "<task>Second</task>" });
    await update({ content: "<task>Third</task>" });
  });

  it("restores the content of the chosen version", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/templates/${VALID.name}/rollback`,
      payload: { version: "1.0.0" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe("<task>Review</task>");
  });

  it("moves forward rather than deleting what came after", async () => {
    // A rollback that erases history is one you cannot undo, and being able to
    // undo is the reason for keeping versions.
    await app.inject({
      method: "POST",
      url: `/api/v1/templates/${VALID.name}/rollback`,
      payload: { version: "1.0.0" },
    });

    const history = await versions();
    expect(history.map((v) => v.version)).toEqual(["1.0.0", "1.0.1", "1.0.2", "1.0.3"]);
    expect(history.at(-1)?.changelog_summary).toBe("Rolled back to 1.0.0");
  });

  it("needs a version in the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/templates/${VALID.name}/rollback`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("answers 404 for a version that is not there", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/templates/${VALID.name}/rollback`,
      payload: { version: "9.9.9" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("can be rolled back again, to the version it just left", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v1/templates/${VALID.name}/rollback`,
      payload: { version: "1.0.0" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/templates/${VALID.name}/rollback`,
      payload: { version: "1.0.2" },
    });

    expect(res.json().content).toBe("<task>Third</task>");
  });
});
