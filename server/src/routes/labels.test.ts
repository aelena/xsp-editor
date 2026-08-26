import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryLabelStore } from "../storage/label-store.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { reservedProjects } from "../schemas/projects.js";

const NOW = "2026-08-26T10:00:00.000Z";

let app: ReturnType<typeof buildApp>;
let audit: ReturnType<typeof createMemoryAuditLog>;

beforeEach(async () => {
  const storage = new MemoryStorageAdapter();
  for (const project of reservedProjects(NOW)) await storage.createProject(project);
  audit = createMemoryAuditLog();
  app = buildApp(storage, audit, undefined, new MemoryLabelStore());
});

async function createPrompt(name = "classify-intent") {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/prompts",
    payload: { name, description: "d", content: "<task>x</task>" },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

async function createTemplate(name = "basic") {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/templates",
    payload: { name, description: "d", content: "<task/>" },
  });
  expect(res.statusCode).toBe(201);
  return name;
}

const setLabels = (id: string, labels: string[]) =>
  app.inject({ method: "PUT", url: `/api/v1/prompts/${id}/labels`, payload: { labels } });

describe("labels on an artifact", () => {
  it("starts empty", async () => {
    const id = await createPrompt();
    const res = await app.inject({ method: "GET", url: `/api/v1/prompts/${id}/labels` });
    expect(res.json().labels).toEqual([]);
  });

  it("sets and reads back", async () => {
    const id = await createPrompt();
    expect((await setLabels(id, ["draft", "nlp"])).json().labels).toEqual(["draft", "nlp"]);
    expect((await app.inject({ method: "GET", url: `/api/v1/prompts/${id}/labels` })).json().labels)
      .toEqual(["draft", "nlp"]);
  });

  it("accepts anything, because free-form means free-form", async () => {
    const id = await createPrompt();
    const res = await setLabels(id, ["cliente/acme", "revisión", "v2 🔥"]);
    expect(res.statusCode).toBe(200);
    expect(res.json().labels).toHaveLength(3);
  });

  it("tidies whitespace and duplicates without complaining", async () => {
    const id = await createPrompt();
    expect((await setLabels(id, ["  Draft ", "draft", "", "  "])).json().labels).toEqual(["Draft"]);
  });

  it("refuses an absurd number of them", async () => {
    // Not a policy about how people should work, a bound so one request cannot
    // put ten thousand rows in the table.
    const id = await createPrompt();
    const res = await setLabels(id, Array.from({ length: 51 }, (_, i) => `l${i}`));
    expect(res.statusCode).toBe(400);
  });

  it("refuses a label longer than the column", async () => {
    const id = await createPrompt();
    expect((await setLabels(id, ["x".repeat(101)])).statusCode).toBe(400);
  });

  it("answers 404 for an artifact that does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts/11111111-0000-4000-8000-000000000009/labels",
    });
    expect(res.statusCode).toBe(404);
  });

  it("works on templates too", async () => {
    await createTemplate();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/templates/basic/labels",
      payload: { labels: ["starter"] },
    });
    expect(res.json().labels).toEqual(["starter"]);
  });

  it("keeps a prompt's labels off a template with the same key", async () => {
    await createTemplate("same");
    const id = await createPrompt("same");
    await setLabels(id, ["from-prompt"]);

    const template = await app.inject({ method: "GET", url: "/api/v1/templates/same/labels" });
    expect(template.json().labels).toEqual([]);
  });

  it("records a change in the artifact's audit trail", async () => {
    // Labelling is a change to the artifact, so it belongs in the same history
    // as everything else that happened to it.
    const id = await createPrompt();
    await setLabels(id, ["draft"]);

    const entry = (await audit.read(id)).find((e) => e.operation === "labelled");
    expect(entry?.detail?.labels_after).toBe("draft");
  });

  it("records nothing when the set does not actually change", async () => {
    // Saving a form without touching the labels should not fill the trail with
    // entries saying nothing happened.
    const id = await createPrompt();
    await setLabels(id, ["draft"]);
    await setLabels(id, ["draft"]);

    expect((await audit.read(id)).filter((e) => e.operation === "labelled")).toHaveLength(1);
  });
});

describe("the management view", () => {
  beforeEach(async () => {
    const p1 = await createPrompt("one");
    const p2 = await createPrompt("two");
    await createTemplate("t1");
    await setLabels(p1, ["nlp", "draft"]);
    await setLabels(p2, ["nlp"]);
    await app.inject({
      method: "PUT",
      url: "/api/v1/templates/t1/labels",
      payload: { labels: ["nlp"] },
    });
  });

  it("lists every label with how many things carry it", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/labels" });
    const nlp = res.json().labels.find((l: { label: string }) => l.label === "nlp");

    expect(nlp).toEqual({ label: "nlp", count: 3, prompts: 2, templates: 1 });
  });

  it("puts the most used first, which is the order worth scanning", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/labels" });
    expect(res.json().labels.map((l: { label: string }) => l.label)).toEqual(["nlp", "draft"]);
  });

  it("says which artifacts carry one", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/labels/nlp/artifacts" });
    expect(res.json().artifacts).toHaveLength(3);
  });

  it("renames across everything, and says how many", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/labels/nlp",
      payload: { to: "language" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ label: "language", affected: 3 });
    expect((await app.inject({ method: "GET", url: "/api/v1/labels/nlp/artifacts" })).json().artifacts)
      .toEqual([]);
  });

  it("merges when renamed onto a label that already exists", async () => {
    // Two names for one thing is the commonest reason to rename, so this is a
    // feature rather than a collision to reject.
    await app.inject({ method: "PUT", url: "/api/v1/labels/nlp", payload: { to: "draft" } });

    const usage = (await app.inject({ method: "GET", url: "/api/v1/labels" })).json().labels;
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ label: "draft", count: 3 });
  });

  it("refuses a rename to nothing", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/labels/nlp",
      payload: { to: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("answers 404 renaming a label nobody has", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/labels/absent",
      payload: { to: "whatever" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("removes from everything, and says how many", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/v1/labels/nlp" });

    expect(res.json()).toEqual({ removed: "nlp", affected: 3 });
    const usage = (await app.inject({ method: "GET", url: "/api/v1/labels" })).json().labels;
    expect(usage.map((l: { label: string }) => l.label)).toEqual(["draft"]);
  });

  it("leaves the other labels on an artifact alone", async () => {
    await app.inject({ method: "DELETE", url: "/api/v1/labels/nlp" });

    const remaining = (await app.inject({ method: "GET", url: "/api/v1/labels/draft/artifacts" }))
      .json().artifacts;
    expect(remaining).toHaveLength(1);
  });

  it("records the rename against every artifact it touched", async () => {
    // A label that changed name under forty prompts should be findable in each
    // of their histories, not only in the label's own.
    const artifacts = (await app.inject({ method: "GET", url: "/api/v1/labels/nlp/artifacts" }))
      .json().artifacts as { key: string }[];
    await app.inject({ method: "PUT", url: "/api/v1/labels/nlp", payload: { to: "language" } });

    for (const artifact of artifacts) {
      const entries = await audit.read(artifact.key);
      expect(
        entries.some((e) => e.detail?.renamed_to === "language"),
        artifact.key,
      ).toBe(true);
    }
  });
});
