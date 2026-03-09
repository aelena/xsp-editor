import { describe, it, expect } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";

function createTestApp() {
  const storage = new MemoryStorageAdapter();
  const app = buildApp(storage);
  return { app, storage };
}

const sampleConstraint = {
  id: "MED-001",
  description: "No medical diagnoses or treatment recommendations",
  severity: "critical" as const,
  category: "safety" as const,
  owner: "compliance-team",
  status: "active" as const,
  xml_block:
    '<constraint id="MED-001" severity="critical">\n  Never provide medical diagnoses or treatment recommendations.\n  If asked, respond: "Please consult a licensed healthcare provider."\n</constraint>',
};

describe("POST /api/v1/constraints", () => {
  it("should create a new constraint", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBe("MED-001");
    expect(body.description).toBe(sampleConstraint.description);
    expect(body.severity).toBe("critical");
    expect(body.category).toBe("safety");
    expect(body.owner).toBe("compliance-team");
    expect(body.status).toBe("active");
    expect(body.xml_block).toBe(sampleConstraint.xml_block);
    expect(body.usage_count).toBe(0);
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();
  });

  it("should default status to active", async () => {
    const { app } = createTestApp();
    const { id, description, severity, category, owner, xml_block } = sampleConstraint;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: { id, description, severity, category, owner, xml_block },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("active");
  });

  it("should default owner to empty string", async () => {
    const { app } = createTestApp();
    const { id, description, severity, category, status, xml_block } = sampleConstraint;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: { id, description, severity, category, status, xml_block },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().owner).toBe("");
  });

  it("should reject duplicate constraint IDs", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    expect(res.statusCode).toBe(409);
  });

  it("should reject invalid constraint ID format", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "invalid-id",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject constraint ID starting with number", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "1MED-001",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject missing required fields", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: { id: "GEN-001" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject invalid severity value", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "GEN-001",
        severity: "extreme",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject invalid category value", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "GEN-001",
        category: "unknown",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject invalid status value", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "GEN-001",
        status: "invalid",
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/v1/constraints", () => {
  it("should list all constraints", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "GEN-001",
        description: "No fabricated information",
        category: "content",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.constraints).toHaveLength(2);
    // Sorted alphabetically by ID
    expect(body.constraints[0].id).toBe("GEN-001");
    expect(body.constraints[1].id).toBe("MED-001");
  });

  it("should return empty list when no constraints", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().constraints).toHaveLength(0);
  });

  it("should filter by severity", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "TONE-001",
        severity: "medium",
        category: "style",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints?severity=critical",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.constraints).toHaveLength(1);
    expect(body.constraints[0].id).toBe("MED-001");
  });

  it("should filter by category", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "GEN-001",
        category: "content",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints?category=safety",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.constraints).toHaveLength(1);
    expect(body.constraints[0].id).toBe("MED-001");
  });

  it("should filter by status", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "OLD-001",
        status: "deprecated",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints?status=active",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.constraints).toHaveLength(1);
    expect(body.constraints[0].id).toBe("MED-001");
  });

  it("should combine multiple filters", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "PII-001",
        severity: "critical",
        category: "safety",
        status: "deprecated",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: {
        ...sampleConstraint,
        id: "GEN-001",
        severity: "high",
        category: "content",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints?severity=critical&status=active",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.constraints).toHaveLength(1);
    expect(body.constraints[0].id).toBe("MED-001");
  });
});

describe("GET /api/v1/constraints/:id", () => {
  it("should get a constraint by ID", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints/MED-001",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("MED-001");
    expect(res.json().description).toBe(sampleConstraint.description);
  });

  it("should return 404 for non-existent constraint", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/constraints/NONEXISTENT-001",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /api/v1/constraints/:id", () => {
  it("should update a constraint", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/constraints/MED-001",
      payload: {
        description: "Updated description",
        severity: "high",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.description).toBe("Updated description");
    expect(body.severity).toBe("high");
    // Unchanged fields should be preserved
    expect(body.category).toBe("safety");
    expect(body.owner).toBe("compliance-team");
    expect(body.xml_block).toBe(sampleConstraint.xml_block);
  });

  it("should update only provided fields", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/constraints/MED-001",
      payload: {
        status: "deprecated",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("deprecated");
    expect(body.description).toBe(sampleConstraint.description);
    expect(body.severity).toBe("critical");
  });

  it("should update updated_at timestamp", async () => {
    const { app } = createTestApp();
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });
    const originalUpdatedAt = createRes.json().updated_at;

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/constraints/MED-001",
      payload: { description: "New description" },
    });

    expect(res.json().updated_at).not.toBe(originalUpdatedAt);
  });

  it("should return 404 for non-existent constraint", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/constraints/NONEXISTENT-001",
      payload: { description: "Updated" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("should reject invalid severity value", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/constraints/MED-001",
      payload: { severity: "extreme" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should reject invalid category value", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/constraints/MED-001",
      payload: { category: "unknown" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/v1/constraints/:id", () => {
  it("should delete a constraint", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    const deleteRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/constraints/MED-001",
    });

    expect(deleteRes.statusCode).toBe(204);

    // Should no longer be retrievable
    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/constraints/MED-001",
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("should not list deleted constraints", async () => {
    const { app } = createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/constraints",
      payload: sampleConstraint,
    });

    await app.inject({
      method: "DELETE",
      url: "/api/v1/constraints/MED-001",
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/constraints",
    });

    expect(listRes.json().constraints).toHaveLength(0);
  });

  it("should return 404 for non-existent constraint", async () => {
    const { app } = createTestApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/constraints/NONEXISTENT-001",
    });

    expect(res.statusCode).toBe(404);
  });
});
