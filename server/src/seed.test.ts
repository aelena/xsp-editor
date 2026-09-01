import { createMemoryAuditLog } from "./services/audit.js";
import { describe, it, expect } from "vitest";
import { buildApp } from "./index.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { seedDefaults } from "./seed.js";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
// There is no XML parser in this project on purpose: prompt content is often
// mid-edit and invalid, so everything here works on text. directContent is
// the scanner the verification rules already use to count what sits directly
// inside a piece of content, which is exactly the question here.
import { directContent } from "./services/verification.js";

async function seededApp() {
  const storage = new MemoryStorageAdapter();
  await seedDefaults(storage);
  return { app: buildApp(storage, createMemoryAuditLog()), storage };
}

describe("seedDefaults", () => {
  it("seeds the default tags", async () => {
    // This ran on an empty store and did nothing at all, because the emptiness
    // check read `.length` on a paginated result: `undefined === 0` is false.
    // A fresh install came up with the tag registry empty.
    const { storage } = await seededApp();
    const tags = await storage.listTags();
    expect(tags.total).toBeGreaterThan(0);
  });

  it("seeds the default constraints", async () => {
    const { storage } = await seededApp();
    const constraints = await storage.listConstraints();
    expect(constraints.total).toBeGreaterThan(0);
  });

  it("does not seed twice", async () => {
    const storage = new MemoryStorageAdapter();
    await seedDefaults(storage);
    const first = (await storage.listTags()).total;
    await seedDefaults(storage);
    expect((await storage.listTags()).total).toBe(first);
  });

  it("seeds the example prompts", async () => {
    const { storage } = await seededApp();
    const prompts = await storage.listPrompts({ page: 1, limit: 50 });
    expect(prompts.total).toBeGreaterThan(0);
  });
});

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "templates");

describe("the built-in templates", () => {
  // The book uses <prompt> as the root in 34 of its 45 examples, including
  // 017.baseline-template.xml, which is the direct counterpart of baseline.xml.
  // These shipped without a root, so what the editor rendered was a bag of
  // sibling elements rather than a document, and a reader who learned <prompt>
  // from the book opened the tool and saw a different shape.
  it("are each a single document rooted at <prompt>", async () => {
    const files = (await readdir(TEMPLATES_DIR)).filter((f) => extname(f) === ".xml");
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = await readFile(join(TEMPLATES_DIR, file), "utf-8");
      const { children, text } = directContent(content);
      expect(children, `${file}: top-level elements`).toBe(1);
      expect(text, `${file}: text outside the root`).toBe("");
      expect(content.trimStart().startsWith("<prompt>"), file).toBe(true);
      expect(content.trimEnd().endsWith("</prompt>"), file).toBe(true);
    }
  });

  it("are seeded with their first version recorded", async () => {
    // Seeding used to create the template and no version, so the original was
    // the one version nobody could get back.
    const { storage } = await seededApp();
    const versions = await storage.listTemplateVersions("baseline");
    expect(versions.map((v) => v.version)).toContain("1.0.0");
  });

  it("refreshes a stale built-in, keeping what was there as a version", async () => {
    const storage = new MemoryStorageAdapter();
    const now = new Date().toISOString();
    await storage.createTemplate({
      name: "baseline",
      description: "stale",
      content: "<task>the old rootless shape</task>",
      category: "general",
      is_builtin: true,
      version: "1.0.0",
      created_at: now,
      updated_at: now,
      projects: [],
    });

    await seedDefaults(storage);

    const refreshed = await storage.getTemplate("baseline");
    expect(refreshed?.content).toContain("<prompt>");
    expect(refreshed?.version).toBe("1.1.0");

    const versions = await storage.listTemplateVersions("baseline");
    const kept = versions.find((v) => v.version === "1.0.0");
    expect(kept?.content).toBe("<task>the old rootless shape</task>");
  });

  it("leaves a template the user made alone", async () => {
    const storage = new MemoryStorageAdapter();
    const now = new Date().toISOString();
    await storage.createTemplate({
      name: "baseline",
      description: "mine",
      content: "<task>mine, and not built in</task>",
      category: "general",
      is_builtin: false,
      version: "2.0.0",
      created_at: now,
      updated_at: now,
      projects: [],
    });

    await seedDefaults(storage);

    const untouched = await storage.getTemplate("baseline");
    expect(untouched?.content).toBe("<task>mine, and not built in</task>");
    expect(untouched?.version).toBe("2.0.0");
  });

  it("does not refresh on every start once it is current", async () => {
    const storage = new MemoryStorageAdapter();
    await seedDefaults(storage);
    const first = await storage.getTemplate("baseline");
    await seedDefaults(storage);
    const second = await storage.getTemplate("baseline");
    expect(second?.version).toBe(first?.version);
    expect(await storage.listTemplateVersions("baseline")).toHaveLength(1);
  });
});

describe("what the list hands out, the detail endpoint must accept", () => {
  it("can fetch every seeded prompt by the id the listing gave", async () => {
    // The bug this exists for: the seeder wrote slug ids like
    // "classify-intent", while every :id route validates a UUID. The listing
    // showed them, the detail endpoint answered 400, and opening one from the
    // list produced an empty editor with no error visible anywhere.
    //
    // Asserting the id matches a UUID pattern would test the same thing more
    // narrowly. Round-tripping through the API tests the property that actually
    // matters: an identifier the client was given is one the client can use.
    const { app } = await seededApp();

    const list = await app.inject({ method: "GET", url: "/api/v1/prompts" });
    expect(list.statusCode).toBe(200);
    const { prompts } = list.json() as { prompts: { id: string; name: string }[] };
    expect(prompts.length).toBeGreaterThan(0);

    for (const prompt of prompts) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/prompts/${prompt.id}`,
      });
      expect(
        res.statusCode,
        `GET /api/v1/prompts/${prompt.id} for "${prompt.name}"`,
      ).toBe(200);
      expect(res.json().content.length).toBeGreaterThan(0);
    }
  });

  it("keeps the readable slug as the name", async () => {
    // The slug is not wasted: it moves to where a name belongs, so the list
    // still reads as something a person chose rather than a UUID.
    const { app } = await seededApp();
    const list = await app.inject({ method: "GET", url: "/api/v1/prompts" });
    const { prompts } = list.json() as { prompts: { name: string }[] };
    expect(prompts.map((p) => p.name)).toContain("classify-intent");
  });
});
