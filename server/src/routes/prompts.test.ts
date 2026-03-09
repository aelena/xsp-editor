import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";

function createTestApp() {
  const storage = new MemoryStorageAdapter();
  const app = buildApp(storage);
  return { app, storage };
}

const samplePrompt = {
  name: "classify-intent",
  description: "Classifies customer messages into support categories",
  content:
    '<task>Classify the following message: $customer_message</task>\n<constraints>\n<constraint id="GEN-001" severity="critical">No fabricated info</constraint>\n</constraints>\n<output_format>JSON with category field</output_format>',
  author: "alice",
  variables: {
    customer_message: {
      description: "The raw customer message",
      required: true,
    },
  },
};

describe("POST /api/v1/prompts", () => {
  it("should create a new prompt", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("classify-intent");
    expect(body.version).toBe("1.0.0");
    expect(body.author).toBe("alice");
    expect(body.tags_used).toContain("task");
    expect(body.tags_used).toContain("constraints");
    expect(body.tags_used).toContain("constraint");
    expect(body.tags_used).toContain("output_format");
    expect(body.constraints_referenced).toContain("GEN-001");
    expect(body.variables.customer_message.description).toBe(
      "The raw customer message",
    );
    expect(body.deleted).toBe(false);
    expect(body.verification_status).toBe("unchecked");
  });

  it("should auto-extract variables from content", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: {
        name: "test",
        description: "Test prompt",
        content: "<task>Do $action with $target</task>",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.variables).toHaveProperty("action");
    expect(body.variables).toHaveProperty("target");
  });

  it("should reject invalid name", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: {
        ...samplePrompt,
        name: "Invalid Name With Spaces",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject missing required fields", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: { name: "test" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/v1/prompts", () => {
  it("should list prompts", async () => {
    const { app } = createTestApp();

    // Create two prompts
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: {
        ...samplePrompt,
        name: "extract-entities",
        description: "Extracts entities",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.prompts).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("should filter by search", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: {
        ...samplePrompt,
        name: "extract-entities",
        description: "Extracts named entities from text",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts?search=classify",
    });

    const body = res.json();
    expect(body.prompts).toHaveLength(1);
    expect(body.prompts[0].name).toBe("classify-intent");
  });

  it("should filter by author", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: { ...samplePrompt, author: "alice" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: {
        ...samplePrompt,
        name: "other",
        description: "Other prompt",
        author: "bob",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts?author=alice",
    });

    const body = res.json();
    expect(body.prompts).toHaveLength(1);
    expect(body.prompts[0].author).toBe("alice");
  });

  it("should paginate results", async () => {
    const { app } = createTestApp();
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v1/prompts",
        payload: {
          ...samplePrompt,
          name: `prompt-${i}`,
          description: `Prompt ${i}`,
        },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts?page=2&limit=2",
    });

    const body = res.json();
    expect(body.prompts).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.page).toBe(2);
  });

  it("should return empty list when no prompts", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts",
    });

    const body = res.json();
    expect(body.prompts).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});

describe("GET /api/v1/prompts/:id", () => {
  it("should get a prompt by id", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${id}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("classify-intent");
  });

  it("should return 404 for non-existent prompt", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts/non-existent-id",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /api/v1/prompts/:id", () => {
  it("should update a prompt and create a new version", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: {
        content: "<task>Updated task: $customer_message</task>",
        version_bump: "minor",
        changelog_summary: "Simplified the prompt",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe("1.1.0");
    expect(body.content).toBe(
      "<task>Updated task: $customer_message</task>",
    );
  });

  it("should default to patch bump", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: {
        description: "Updated description",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe("1.0.1");
  });

  it("should handle major version bump", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: {
        content: "<task>Completely new approach</task>",
        version_bump: "major",
        changelog_summary: "Complete rewrite",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe("2.0.0");
  });

  it("should return 404 for non-existent prompt", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/prompts/non-existent-id",
      payload: { description: "Updated" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/v1/prompts/:id", () => {
  it("should soft-delete a prompt", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${id}`,
    });

    expect(deleteRes.statusCode).toBe(204);

    // Should no longer be retrievable
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("should not list deleted prompts", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    await app.inject({
      method: "DELETE",
      url: `/api/v1/prompts/${id}`,
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/prompts",
    });

    expect(listRes.json().prompts).toHaveLength(0);
  });

  it("should return 404 for non-existent prompt", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/prompts/non-existent-id",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/v1/prompts/:id/versions", () => {
  it("should list all versions", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    // Create two more versions
    await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: { content: "<task>v1.0.1</task>", version_bump: "patch" },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: { content: "<task>v1.1.0</task>", version_bump: "minor" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${id}/versions`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.versions).toHaveLength(3);
    expect(body.versions[0].version).toBe("1.0.0");
    expect(body.versions[1].version).toBe("1.0.1");
    expect(body.versions[2].version).toBe("1.1.0");
  });

  it("should return 404 for non-existent prompt", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts/non-existent/versions",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/v1/prompts/:id/versions/:ver", () => {
  it("should get a specific version", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: { content: "<task>Updated</task>", version_bump: "minor" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${id}/versions/1.0.0`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe("1.0.0");
    expect(body.content).toBe(samplePrompt.content);
  });

  it("should return 404 for non-existent version", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${id}/versions/9.9.9`,
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/v1/prompts/:id/rollback", () => {
  it("should rollback to a previous version", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    // Update to v1.1.0
    await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: {
        content: "<task>New content</task>",
        version_bump: "minor",
      },
    });

    // Rollback to v1.0.0
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/rollback`,
      payload: { version: "1.0.0" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe("1.1.1");
    expect(body.content).toBe(samplePrompt.content);
  });

  it("should create a new version record on rollback", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: {
        content: "<task>New content</task>",
        version_bump: "minor",
      },
    });

    await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/rollback`,
      payload: { version: "1.0.0" },
    });

    const versionsRes = await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${id}/versions`,
    });

    const versions = versionsRes.json().versions;
    expect(versions).toHaveLength(3);
    expect(versions[2].changelog_summary).toBe(
      "Rolled back to version 1.0.0",
    );
  });

  it("should return 404 for non-existent target version", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/rollback`,
      payload: { version: "9.9.9" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("should return 400 if version not provided", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: samplePrompt,
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/rollback`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
