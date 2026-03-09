import { describe, it, expect } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";

function createTestApp() {
  const storage = new MemoryStorageAdapter();
  const app = buildApp(storage);
  return { app, storage };
}

const sampleTag = {
  name: "task",
  purpose: "Primary instruction — what the model should do",
  use_when: "Every prompt",
  example: "<task>Summarize the document for executives</task>",
  enforcement: "required" as const,
};

describe("POST /api/v1/tags", () => {
  it("should create a new tag", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("task");
    expect(body.purpose).toBe(sampleTag.purpose);
    expect(body.use_when).toBe("Every prompt");
    expect(body.example).toBe(sampleTag.example);
    expect(body.enforcement).toBe("required");
    expect(body.usage_count).toBe(0);
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();
  });

  it("should default enforcement to optional", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: {
        name: "context",
        purpose: "Background information",
        use_when: "When context is needed",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().enforcement).toBe("optional");
  });

  it("should reject duplicate tag names", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    expect(res.statusCode).toBe(409);
  });

  it("should reject invalid tag name", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: {
        ...sampleTag,
        name: "Invalid-Name",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject tag name starting with number", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: {
        ...sampleTag,
        name: "1task",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject missing required fields", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: { name: "task" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject invalid enforcement value", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: {
        ...sampleTag,
        name: "test_tag",
        enforcement: "invalid",
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/v1/tags", () => {
  it("should list all tags", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: {
        name: "constraints",
        purpose: "Behavioral guardrails",
        use_when: "When rules are needed",
        enforcement: "recommended",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tags",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tags).toHaveLength(2);
    // Sorted alphabetically
    expect(body.tags[0].name).toBe("constraints");
    expect(body.tags[1].name).toBe("task");
  });

  it("should return empty list when no tags", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tags",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toHaveLength(0);
  });
});

describe("GET /api/v1/tags/:name", () => {
  it("should get a tag by name", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tags/task",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("task");
    expect(res.json().purpose).toBe(sampleTag.purpose);
  });

  it("should return 404 for non-existent tag", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tags/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /api/v1/tags/:name", () => {
  it("should update a tag", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tags/task",
      payload: {
        purpose: "Updated purpose",
        enforcement: "recommended",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.purpose).toBe("Updated purpose");
    expect(body.enforcement).toBe("recommended");
    // Unchanged fields should be preserved
    expect(body.use_when).toBe("Every prompt");
    expect(body.example).toBe(sampleTag.example);
  });

  it("should update only provided fields", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tags/task",
      payload: {
        enforcement: "deprecated",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enforcement).toBe("deprecated");
    expect(body.purpose).toBe(sampleTag.purpose);
  });

  it("should update updated_at timestamp", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });
    const originalUpdatedAt = createRes.json().updated_at;

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tags/task",
      payload: { purpose: "New purpose" },
    });

    expect(res.json().updated_at).not.toBe(originalUpdatedAt);
  });

  it("should return 404 for non-existent tag", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tags/nonexistent",
      payload: { purpose: "Updated" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("should reject invalid enforcement value", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/tags/task",
      payload: { enforcement: "invalid" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/v1/tags/:name", () => {
  it("should delete a tag", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    const deleteRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/tags/task",
    });

    expect(deleteRes.statusCode).toBe(204);

    // Should no longer be retrievable
    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/tags/task",
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("should not list deleted tags", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/tags",
      payload: sampleTag,
    });

    await app.inject({
      method: "DELETE",
      url: "/api/v1/tags/task",
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/tags",
    });

    expect(listRes.json().tags).toHaveLength(0);
  });

  it("should return 404 for non-existent tag", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/tags/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });
});
