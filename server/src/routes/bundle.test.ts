import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryLabelStore } from "../storage/label-store.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { reservedProjects, GENERAL_PROJECT_ID } from "../schemas/projects.js";
import { BUNDLE_FORMAT } from "../services/bundle.js";

const NOW = "2026-08-26T10:00:00.000Z";

interface World {
  app: ReturnType<typeof buildApp>;
  storage: MemoryStorageAdapter;
  labels: MemoryLabelStore;
}

async function makeWorld(): Promise<World> {
  const storage = new MemoryStorageAdapter();
  for (const project of reservedProjects(NOW)) await storage.createProject(project);
  const labels = new MemoryLabelStore();
  return {
    app: buildApp(storage, createMemoryAuditLog(), undefined, labels),
    storage,
    labels,
  };
}

let world: World;

beforeEach(async () => {
  world = await makeWorld();
});

async function seedSomething(w: World) {
  const prompt = await w.app.inject({
    method: "POST",
    url: "/api/v1/prompts",
    payload: { name: "classify-intent", description: "d", content: "<task>x</task>" },
  });
  const id = prompt.json().id as string;

  await w.app.inject({
    method: "POST",
    url: "/api/v1/templates",
    payload: { name: "basic", description: "d", content: "<task/>" },
  });
  await w.app.inject({
    method: "POST",
    url: "/api/v1/tags",
    payload: { name: "task", purpose: "The instruction", use_when: "Always" },
  });
  await w.app.inject({
    method: "PUT",
    url: `/api/v1/prompts/${id}/labels`,
    payload: { labels: ["draft"] },
  });
  return id;
}

const exportBundle = async (w: World) => {
  const res = await w.app.inject({ method: "GET", url: "/api/v1/export" });
  expect(res.statusCode).toBe(200);
  return res.json();
};

describe("export", () => {
  it("declares its format and when it was made", async () => {
    const bundle = await exportBundle(world);
    expect(bundle.format).toBe(BUNDLE_FORMAT);
    expect(Date.parse(bundle.exported_at)).not.toBeNaN();
    expect(bundle.source).toBe("xsp-editor");
  });

  it("carries everything a person made", async () => {
    await seedSomething(world);
    const bundle = await exportBundle(world);

    expect(bundle.prompts).toHaveLength(1);
    expect(bundle.templates).toHaveLength(1);
    expect(bundle.tags).toHaveLength(1);
    expect(bundle.projects.length).toBeGreaterThanOrEqual(2);
    expect(bundle.labels).toEqual([
      { kind: "prompt", key: expect.any(String), labels: ["draft"] },
    ]);
  });

  it("carries the version history, not just the current content", async () => {
    const id = await seedSomething(world);
    await world.app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: { content: "<task>changed</task>" },
    });

    const bundle = await exportBundle(world);
    expect(bundle.prompt_versions.length).toBeGreaterThanOrEqual(2);
    expect(bundle.template_versions.length).toBeGreaterThanOrEqual(1);
  });

  it("includes archived artifacts", async () => {
    // A backup that silently omits what you retired loses the thing you kept
    // for traceability.
    const id = await seedSomething(world);
    await world.app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const bundle = await exportBundle(world);
    expect(bundle.prompts).toHaveLength(1);
  });

  it("carries the audit trail, so history travels with the work", async () => {
    await seedSomething(world);
    const bundle = await exportBundle(world);
    expect(bundle.audit.length).toBeGreaterThan(0);
  });

  it("suggests a filename, because three files called export are indistinguishable", async () => {
    const res = await world.app.inject({ method: "GET", url: "/api/v1/export" });
    expect(res.headers["content-disposition"]).toMatch(/filename="xsp-export-.*\.json"/);
  });

  it("exports an empty instance without complaining", async () => {
    const bundle = await exportBundle(world);
    expect(bundle.prompts).toEqual([]);
  });
});

describe("import", () => {
  // payload typed rather than unknown: an unknown there makes TypeScript pick a
  // different inject overload, and every .json() on the result then fails to
  // typecheck while vitest, which strips types, runs it happily.
  const post = (w: World, bundle: object, query = "") =>
    w.app.inject({ method: "POST", url: `/api/v1/import${query}`, payload: bundle });

  it("brings a bundle into an empty instance", async () => {
    await seedSomething(world);
    const bundle = await exportBundle(world);

    const fresh = await makeWorld();
    const res = await post(fresh, bundle);

    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBeGreaterThan(0);
    expect(res.json().failed).toEqual([]);

    const prompts = await fresh.app.inject({ method: "GET", url: "/api/v1/prompts" });
    expect(prompts.json().prompts).toHaveLength(1);
  });

  it("carries labels across", async () => {
    await seedSomething(world);
    const bundle = await exportBundle(world);

    const fresh = await makeWorld();
    await post(fresh, bundle);

    const usage = await fresh.app.inject({ method: "GET", url: "/api/v1/labels" });
    expect(usage.json().labels).toEqual([
      { label: "draft", count: 1, prompts: 1, templates: 0 },
    ]);
  });

  it("carries membership across, because projects go in first", async () => {
    // A membership pointing at a project that has not been created yet would be
    // dropped, so the order of the collections is load-bearing.
    await seedSomething(world);
    const bundle = await exportBundle(world);

    const fresh = await makeWorld();
    await post(fresh, bundle);

    const prompts = await fresh.app.inject({ method: "GET", url: "/api/v1/prompts" });
    expect(prompts.json().prompts[0].projects).toEqual([GENERAL_PROJECT_ID]);
  });

  it("skips what already exists by default", async () => {
    // An import that overwrites by default eats somebody's afternoon the first
    // time they try it against the wrong instance.
    await seedSomething(world);
    const bundle = await exportBundle(world);

    const res = await post(world, bundle);
    expect(res.json().skipped).toBeGreaterThan(0);
    expect(res.json().updated).toBe(0);
  });

  it("overwrites when told to", async () => {
    const id = await seedSomething(world);
    const bundle = await exportBundle(world);

    await world.app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: { content: "<task>local edit</task>" },
    });

    await post(world, bundle, "?on_conflict=overwrite");

    const prompt = await world.app.inject({ method: "GET", url: `/api/v1/prompts/${id}` });
    expect(prompt.json().content).toBe("<task>x</task>");
  });

  it("reports what a dry run would do and writes nothing", async () => {
    await seedSomething(world);
    const bundle = await exportBundle(world);
    const fresh = await makeWorld();

    const res = await post(fresh, bundle, "?dry_run=true");

    expect(res.json().dry_run).toBe(true);
    expect(res.json().created).toBeGreaterThan(0);
    const prompts = await fresh.app.inject({ method: "GET", url: "/api/v1/prompts" });
    expect(prompts.json().prompts).toEqual([]);
  });

  it("gives the same counts on the dry run as on the real one", async () => {
    // Same code path, so the plan cannot describe something different from what
    // happens. This is the test that keeps it that way.
    await seedSomething(world);
    const bundle = await exportBundle(world);

    const a = await makeWorld();
    const dry = (await post(a, bundle, "?dry_run=true")).json();
    const b = await makeWorld();
    const real = (await post(b, bundle)).json();

    expect({ created: dry.created, updated: dry.updated, skipped: dry.skipped }).toEqual({
      created: real.created,
      updated: real.updated,
      skipped: real.skipped,
    });
  });

  it("refuses a bundle from a format it does not know", async () => {
    const res = await post(world, { format: 99, prompts: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/format 99/);
  });

  it("refuses something that is not a bundle at all", async () => {
    expect((await post(world, { hello: "world" })).statusCode).toBe(400);
    expect((await post(world, [])).statusCode).toBe(400);
  });

  it("says it did not import the audit trail rather than dropping it quietly", async () => {
    // A history that can be written by hand is not evidence. Refusing is right;
    // refusing silently is not.
    await seedSomething(world);
    const bundle = await exportBundle(world);
    const fresh = await makeWorld();

    const res = await post(fresh, bundle);
    expect(res.json().notes.join(" ")).toMatch(/audit entries were not imported/);
  });

  it("imports the good records and names the bad one", async () => {
    // One malformed prompt should not lose the other forty.
    await seedSomething(world);
    const bundle = await exportBundle(world);
    bundle.prompts.push({ no_identifier: true });

    const fresh = await makeWorld();
    const res = await post(fresh, bundle);

    expect(res.json().created).toBeGreaterThan(0);
    expect(res.json().failed).toEqual([
      { kind: "prompts", key: "?", reason: "no identifier" },
    ]);
  });

  it("tolerates a bundle missing whole collections", async () => {
    // A hand-written bundle carrying only tags is a legitimate way to share a
    // vocabulary.
    const res = await post(world, {
      format: BUNDLE_FORMAT,
      tags: [
        {
          name: "shared", purpose: "p", use_when: "w", example: "",
          enforcement: "optional", usage_count: 0, created_at: NOW, updated_at: NOW,
        },
      ],
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(1);
  });

  it("round-trips: export, import into a fresh instance, export again", async () => {
    // The property that matters for a backup, and the one a field-by-field test
    // would only approximate.
    const id = await seedSomething(world);
    await world.app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: { content: "<task>second</task>" },
    });

    const first = await exportBundle(world);
    const fresh = await makeWorld();
    await post(fresh, first);
    const second = await exportBundle(fresh);

    for (const key of ["prompts", "templates", "tags", "projects", "labels"] as const) {
      expect(second[key], key).toEqual(first[key]);
    }
    expect(second.prompt_versions).toEqual(first.prompt_versions);
  });
});
