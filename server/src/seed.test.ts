import { describe, it, expect } from "vitest";
import { buildApp } from "./index.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { seedDefaults } from "./seed.js";

async function seededApp() {
  const storage = new MemoryStorageAdapter();
  await seedDefaults(storage);
  return { app: buildApp(storage), storage };
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
