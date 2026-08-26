import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryLabelStore } from "../storage/label-store.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { reservedProjects } from "../schemas/projects.js";

const NOW = "2026-08-26T10:00:00.000Z";

let app: ReturnType<typeof buildApp>;
let storage: MemoryStorageAdapter;
let labels: MemoryLabelStore;

interface Hit {
  kind: string;
  key: string;
  title: string;
  context: string;
  field: string;
}

beforeEach(async () => {
  storage = new MemoryStorageAdapter();
  for (const project of reservedProjects(NOW)) await storage.createProject(project);
  labels = new MemoryLabelStore();
  app = buildApp(storage, createMemoryAuditLog(), undefined, labels);
});

const search = async (q: string, extra = "") => {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/search?q=${encodeURIComponent(q)}${extra}`,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { query: string; total: number; hits: Hit[] };
};

/**
 * Every create is asserted.
 *
 * The first draft did not check them, so a constraint that failed validation for
 * a missing xml_block looked like a search bug in two other tests. A helper that
 * silently tolerates a 400 hides the setup and blames the subject.
 */
function created(res: { statusCode: number; body: string }, what: string) {
  expect(res.statusCode, `${what}: ${res.body}`).toBe(201);
  return res;
}

async function seed() {
  const prompt = await app.inject({
    method: "POST",
    url: "/api/v1/prompts",
    payload: {
      name: "classify-intent",
      description: "Decide what the customer wants",
      content: "<task>Classify</task>\n<constraint>GEN-001</constraint>",
    },
  });
  created(prompt, "prompt");
  const id = prompt.json().id as string;

  created(
    await app.inject({
      method: "POST",
      url: "/api/v1/templates",
      payload: {
        name: "review-checklist",
        description: "For reviewing a prompt",
        content: "<task>Review</task>",
        category: "review",
      },
    }),
    "template",
  );
  created(
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: { name: "task", purpose: "The instruction to follow", use_when: "Always" },
    }),
    "tag",
  );
  created(
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        id: "GEN-001",
        description: "Never emit personal data",
        severity: "critical",
        category: "safety",
        owner: "antonio",
        xml_block: "<constraint id=\"GEN-001\">Never emit personal data</constraint>",
      },
    }),
    "constraint",
  );
  created(
    await app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "Serrin" } }),
    "project",
  );
  await app.inject({
    method: "PUT",
    url: `/api/v1/prompts/${id}/labels`,
    payload: { labels: ["urgent"] },
  });
  return id;
}

describe("what it searches", () => {
  beforeEach(async () => {
    await seed();
  });

  it("reaches every kind of thing", async () => {
    // Search existed per page and nowhere across, so finding a constraint by a
    // word in its description meant knowing it was a constraint first. That is
    // backwards: you search because you do not know where it is.
    const kinds = new Set<string>();
    for (const q of ["classify", "review", "task", "GEN-001", "Serrin", "urgent"]) {
      for (const hit of (await search(q)).hits) kinds.add(hit.kind);
    }

    expect(kinds).toEqual(
      new Set(["prompt", "template", "tag", "constraint", "project", "label"]),
    );
  });

  it("finds a prompt by name", async () => {
    const hits = (await search("classify")).hits.filter((h) => h.kind === "prompt");
    expect(hits[0]).toMatchObject({ title: "classify-intent", field: "name" });
  });

  it("finds a prompt by a word in its description", async () => {
    const hits = (await search("customer")).hits.filter((h) => h.kind === "prompt");
    expect(hits[0]?.field).toBe("description");
  });

  it("finds a prompt by something in its body", async () => {
    // The interesting question: which prompts mention this constraint.
    const hits = (await search("GEN-001")).hits.filter((h) => h.kind === "prompt");
    expect(hits[0]?.field).toBe("content");
  });

  it("finds a constraint by its owner", async () => {
    const hits = (await search("antonio")).hits;
    expect(hits.some((h) => h.kind === "constraint")).toBe(true);
  });

  it("finds a template by its category", async () => {
    const hits = (await search("review")).hits.filter((h) => h.kind === "template");
    expect(hits).toHaveLength(1);
  });

  it("is case insensitive", async () => {
    expect((await search("CLASSIFY")).hits.length).toBeGreaterThan(0);
  });

  it("matches part of a word", async () => {
    expect((await search("lassify")).hits.length).toBeGreaterThan(0);
  });

  it("finds an archived prompt", async () => {
    // Somebody looking for a prompt they retired is exactly the person who
    // needs to find it.
    //
    // The already-seeded one, not a second seed: seeding twice collides on the
    // template name and the 409 was reported as a search failure.
    const list = await app.inject({ method: "GET", url: "/api/v1/prompts" });
    const id = list.json().prompts[0].id as string;
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    expect((await search("classify")).hits.some((h) => h.kind === "prompt")).toBe(true);
  });

  it("answers nothing for a word nobody used", async () => {
    const result = await search("zzzznothing");
    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("what a hit says", () => {
  beforeEach(async () => {
    await seed();
  });

  it("carries a key that can be put in a URL", async () => {
    const hit = (await search("classify")).hits.find((h) => h.kind === "prompt")!;
    expect(hit.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("says why it matched, so a list is readable without opening each one", async () => {
    const hit = (await search("customer")).hits.find((h) => h.kind === "prompt")!;
    expect(hit.context).toBe("Decide what the customer wants");
  });

  it("excerpts the line for a match inside a body", async () => {
    // "Matched somewhere in 4kB of XML" tells the reader nothing they can act on.
    const hit = (await search("GEN-001")).hits.find((h) => h.kind === "prompt")!;
    expect(hit.context).toBe("<constraint>GEN-001</constraint>");
  });

  it("keeps the match visible when the line is long", async () => {
    const filler = "x".repeat(300);
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: {
        name: "long-line",
        description: "d",
        content: `<task>${filler}NEEDLE${filler}</task>`,
      },
    });

    const hit = (await search("NEEDLE")).hits.find((h) => h.title === "long-line")!;
    expect(hit.context.toLowerCase()).toContain("needle");
    expect(hit.context.length).toBeLessThan(200);
  });

  it("says how many items carry a label", async () => {
    const hit = (await search("urgent")).hits.find((h) => h.kind === "label")!;
    expect(hit.context).toBe("1 item");
  });

  it("says a project has no folder rather than leaving it blank", async () => {
    const hit = (await search("Serrin")).hits.find((h) => h.kind === "project")!;
    expect(hit.context).toBe("No folder on disk");
  });
});

describe("ranking", () => {
  it("puts an exact name above a description match", async () => {
    // A name that is what you typed is almost always what you meant; a word
    // buried in a description almost never is.
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: { name: "summarise", description: "d", content: "<task>x</task>" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: { name: "other", description: "mentions summarise in passing", content: "<task>x</task>" },
    });

    const hits = (await search("summarise")).hits;
    expect(hits[0].title).toBe("summarise");
  });

  it("puts a name that starts with the query above one that merely contains it", async () => {
    for (const name of ["extract-entities", "pre-extract"]) {
      await app.inject({
        method: "POST",
        url: "/api/v1/prompts",
        payload: { name, description: "d", content: "<task>x</task>" },
      });
    }

    expect((await search("extract")).hits[0].title).toBe("extract-entities");
  });
});

describe("the request", () => {
  it("requires a query", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/search" })).statusCode).toBe(400);
  });

  it("refuses an absurdly long query", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=${"x".repeat(201)}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("treats a whitespace-only query as no results rather than an error", async () => {
    const result = await search("   ");
    expect(result.hits).toEqual([]);
  });

  it("caps the list but reports the true total, so the client can say there is more", async () => {
    for (let i = 0; i < 12; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/v1/prompts",
        payload: { name: `common-${i}`, description: "d", content: "<task>x</task>" },
      });
    }

    const result = await search("common", "&limit=5");
    expect(result.hits).toHaveLength(5);
    expect(result.total).toBe(12);
  });

  it("does not leak the internal rank into the response", async () => {
    await seed();
    const hit = (await search("classify")).hits[0] as unknown as Record<string, unknown>;
    expect(hit.rank).toBeUndefined();
  });
});
