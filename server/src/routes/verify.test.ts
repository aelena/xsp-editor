import { describe, it, expect } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";

function createTestApp() {
  const storage = new MemoryStorageAdapter();
  const app = buildApp(storage);
  return { app, storage };
}

async function seedTags(app: ReturnType<typeof buildApp>) {
  await app.inject({
    method: "POST",
    url: "/api/v1/tags",
    payload: {
      name: "task",
      purpose: "Primary instruction",
      use_when: "Every prompt",
      enforcement: "required",
    },
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
  await app.inject({
    method: "POST",
    url: "/api/v1/tags",
    payload: {
      name: "input",
      purpose: "User-provided data",
      use_when: "When input is needed",
      enforcement: "optional",
    },
  });
  await app.inject({
    method: "POST",
    url: "/api/v1/tags",
    payload: {
      name: "output_format",
      purpose: "Expected response shape",
      use_when: "When output format matters",
      enforcement: "optional",
    },
  });
}

describe("POST /api/v1/verify", () => {
  it("should return passed for valid prompt with all checks passing", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content: "<task>Classify $customer_message into categories</task><output_format>JSON</output_format>",
        variables: {
          customer_message: { description: "The raw customer message" },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.checks).toBeInstanceOf(Array);
    expect(body.checks.length).toBe(14);
    expect(body.anti_pattern_scan).toBeInstanceOf(Array);
  });

  it("should return failed when required tags are missing", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content: "<input>Some data</input>",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("failed");
    const requiredCheck = body.checks.find(
      (c: { rule: string }) => c.rule === "required_tags",
    );
    expect(requiredCheck.status).toBe("failed");
    expect(requiredCheck.message).toContain("task");
  });

  it("should warn about empty sections", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content:
          "<task>Do something</task><input></input>",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const emptyCheck = body.checks.find(
      (c: { rule: string }) => c.rule === "empty_sections",
    );
    expect(emptyCheck.status).toBe("warning");
    expect(emptyCheck.message).toContain("input");
  });

  it("should warn for undocumented variables", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content: "<task>Process $order_id for $customer</task>",
        variables: {
          order_id: { description: "The order identifier" },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const varCheck = body.checks.find(
      (c: { rule: string }) => c.rule === "variable_docs",
    );
    expect(varCheck.status).toBe("warning");
    expect(varCheck.message).toContain("$customer");
  });

  it("should warn about nesting depth exceeding 3", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content:
          "<task><constraints><input><output_format>too deep</output_format></input></constraints></task>",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const nestCheck = body.checks.find(
      (c: { rule: string }) => c.rule === "nesting_depth",
    );
    expect(nestCheck.status).toBe("warning");
  });

  it("should return 400 for invalid request body", async () => {
    const { app } = createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("should return 400 for missing content", async () => {
    const { app } = createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: { variables: {} },
    });

    expect(res.statusCode).toBe(400);
  });

  it("should work with no tags in registry", async () => {
    const { app } = createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content: "<task>Do something</task>",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.checks).toBeInstanceOf(Array);
    expect(body.score).toBeGreaterThanOrEqual(0);
  });

  it("should default variables to empty object when not provided", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content: "<task>Do something static</task><output_format>text</output_format>",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("passed");
  });

  it("should include anti_pattern_scan in response", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content: "<task>Do</task><input></input>",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.anti_pattern_scan).toBeInstanceOf(Array);
    const emptyAccum = body.anti_pattern_scan.find(
      (a: { pattern: string }) => a.pattern === "Empty Section Accumulation",
    );
    expect(emptyAccum).toBeDefined();
    expect(emptyAccum.detected).toBe(true);
  });

  it("should warn about unapproved tags", async () => {
    const { app } = createTestApp();
    await seedTags(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify",
      payload: {
        content: "<task>Do</task><custom_unknown>data</custom_unknown>",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const approvedCheck = body.checks.find(
      (c: { rule: string }) => c.rule === "approved_tags",
    );
    expect(approvedCheck.status).toBe("warning");
    expect(approvedCheck.message).toContain("custom_unknown");
  });
});

describe("POST /api/v1/verify/fix", () => {
  it("should fix empty_sections by removing empty tags", async () => {
    const { app } = createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify/fix",
      payload: {
        content: "<task>Do stuff</task><examples></examples><notes>  </notes>",
        rule: "empty_sections",
        message: "Empty sections found: examples, notes",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content).toBeDefined();
    expect(body.content).not.toContain("<examples></examples>");
    expect(body.content).not.toContain("<notes>  </notes>");
    expect(body.content).toContain("<task>Do stuff</task>");
  });

  it("should fix cdata_for_input by wrapping content in CDATA", async () => {
    const { app } = createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify/fix",
      payload: {
        content: "<task>Do</task><input>user content here</input>",
        rule: "cdata_for_input",
        message: "Input sections without CDATA",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content).toContain("<![CDATA[user content here]]>");
  });

  it("should fix variable_docs by adding stub descriptions", async () => {
    const { app } = createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify/fix",
      payload: {
        content: "<task>Process $order_id</task>",
        rule: "variable_docs",
        message: "Undocumented variables: $order_id",
        variables: {},
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.variables).toBeDefined();
    expect(body.variables.order_id).toEqual({
      description: "Template variable",
      required: true,
    });
  });

  it("should return 400 for non-fixable rule", async () => {
    const { app } = createTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/verify/fix",
      payload: {
        content: "<task>Do</task>",
        rule: "nesting_depth",
        message: "Maximum nesting depth exceeds limit",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain("does not support auto-fix");
  });
});
