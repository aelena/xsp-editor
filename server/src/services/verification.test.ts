import { describe, it, expect } from "vitest";
import {
  checkApprovedTags,
  checkRequiredTags,
  checkEmptySections,
  checkNestingDepth,
  checkVariableDocs,
  runVerification,
} from "./verification.js";
import type { VerificationContext } from "./verification.js";
import type { TagRecord } from "../schemas/tags.js";

function makeTag(name: string, enforcement: TagRecord["enforcement"] = "optional"): TagRecord {
  return {
    name,
    purpose: "test",
    use_when: "test",
    example: "",
    enforcement,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeContext(overrides?: Partial<VerificationContext>): VerificationContext {
  return {
    approvedTags: [
      makeTag("task", "required"),
      makeTag("constraints", "recommended"),
      makeTag("input", "optional"),
      makeTag("output_format", "optional"),
    ],
    documentedVariables: {},
    ...overrides,
  };
}

describe("checkApprovedTags", () => {
  it("should pass when all tags are approved", () => {
    const content = "<task>Do something</task><input>data</input>";
    const result = checkApprovedTags(content, makeContext());
    expect(result.status).toBe("passed");
  });

  it("should warn when unapproved tags are used", () => {
    const content = "<task>Do</task><custom_tag>data</custom_tag>";
    const result = checkApprovedTags(content, makeContext());
    expect(result.status).toBe("warning");
    expect(result.message).toContain("custom_tag");
  });

  it("should warn when deprecated tags are used", () => {
    const context = makeContext({
      approvedTags: [
        makeTag("task", "required"),
        makeTag("old_tag", "deprecated"),
      ],
    });
    const content = "<task>Do</task><old_tag>data</old_tag>";
    const result = checkApprovedTags(content, context);
    expect(result.status).toBe("warning");
    expect(result.message).toContain("Deprecated");
  });

  it("should pass when no tags in registry", () => {
    const context = makeContext({ approvedTags: [] });
    const content = "<anything>test</anything>";
    const result = checkApprovedTags(content, context);
    expect(result.status).toBe("passed");
  });
});

describe("checkRequiredTags", () => {
  it("should pass when all required tags are present", () => {
    const content = "<task>Classify something</task>";
    const result = checkRequiredTags(content, makeContext());
    expect(result.status).toBe("passed");
  });

  it("should fail when required tags are missing", () => {
    const content = "<input>some data</input>";
    const result = checkRequiredTags(content, makeContext());
    expect(result.status).toBe("failed");
    expect(result.message).toContain("task");
  });

  it("should pass when no required tags are defined", () => {
    const context = makeContext({
      approvedTags: [makeTag("input", "optional")],
    });
    const content = "<input>data</input>";
    const result = checkRequiredTags(content, context);
    expect(result.status).toBe("passed");
  });

  it("should fail when multiple required tags are missing", () => {
    const context = makeContext({
      approvedTags: [
        makeTag("task", "required"),
        makeTag("output_format", "required"),
      ],
    });
    const content = "<input>data</input>";
    const result = checkRequiredTags(content, context);
    expect(result.status).toBe("failed");
    expect(result.message).toContain("task");
    expect(result.message).toContain("output_format");
  });
});

describe("checkEmptySections", () => {
  it("should pass when no empty sections exist", () => {
    const content = "<task>Do something</task><input>data</input>";
    const result = checkEmptySections(content);
    expect(result.status).toBe("passed");
  });

  it("should warn when empty sections are found", () => {
    const content = "<task>Do something</task><examples></examples>";
    const result = checkEmptySections(content);
    expect(result.status).toBe("warning");
    expect(result.message).toContain("examples");
    expect(result.anti_pattern).toBe("Empty Section Accumulation");
  });

  it("should warn for whitespace-only sections", () => {
    const content = "<task>Do something</task><examples>   \n  </examples>";
    const result = checkEmptySections(content);
    expect(result.status).toBe("warning");
    expect(result.message).toContain("examples");
  });

  it("should not flag sections with content", () => {
    const content = "<examples>Here is an example</examples>";
    const result = checkEmptySections(content);
    expect(result.status).toBe("passed");
  });
});

describe("checkNestingDepth", () => {
  it("should pass for shallow nesting", () => {
    const content = "<task><subtask>Do</subtask></task>";
    const result = checkNestingDepth(content);
    expect(result.status).toBe("passed");
    expect(result.message).toContain("2");
  });

  it("should pass for exactly 3 levels", () => {
    const content = "<a><b><c>content</c></b></a>";
    const result = checkNestingDepth(content);
    expect(result.status).toBe("passed");
    expect(result.message).toContain("3");
  });

  it("should warn for nesting deeper than 3", () => {
    const content = "<a><b><c><d>too deep</d></c></b></a>";
    const result = checkNestingDepth(content);
    expect(result.status).toBe("warning");
    expect(result.message).toContain("4");
  });

  it("should handle flat structure", () => {
    const content = "<task>Do</task><input>data</input>";
    const result = checkNestingDepth(content);
    expect(result.status).toBe("passed");
  });
});

describe("checkVariableDocs", () => {
  it("should pass when all variables are documented", () => {
    const content = "<task>Process $customer_message</task>";
    const context = makeContext({
      documentedVariables: {
        customer_message: { description: "The customer's message" },
      },
    });
    const result = checkVariableDocs(content, context);
    expect(result.status).toBe("passed");
  });

  it("should fail when variables are undocumented", () => {
    const content = "<task>Process $customer_message for $order_id</task>";
    const context = makeContext({
      documentedVariables: {
        customer_message: { description: "The message" },
      },
    });
    const result = checkVariableDocs(content, context);
    expect(result.status).toBe("failed");
    expect(result.message).toContain("$order_id");
  });

  it("should pass when no variables in content", () => {
    const content = "<task>Do something static</task>";
    const result = checkVariableDocs(content, makeContext());
    expect(result.status).toBe("passed");
  });

  it("should fail when no variables are documented but content has them", () => {
    const content = "<task>Process $input</task>";
    const result = checkVariableDocs(content, makeContext());
    expect(result.status).toBe("failed");
    expect(result.message).toContain("$input");
  });
});

describe("runVerification", () => {
  it("should return passed when all checks pass", () => {
    const content = "<task>Classify $message</task>";
    const context = makeContext({
      documentedVariables: {
        message: { description: "The input message" },
      },
    });
    const result = runVerification(content, context);
    expect(result.status).toBe("passed");
    expect(result.score).toBe(100);
    expect(result.checks).toHaveLength(5);
    expect(result.anti_pattern_scan.length).toBeGreaterThan(0);
  });

  it("should return failed when any check fails", () => {
    const content = "<task>Process $undocumented</task>";
    const result = runVerification(content, makeContext());
    expect(result.status).toBe("failed");
    expect(result.score).toBeLessThan(100);
  });

  it("should return warnings when checks warn but none fail", () => {
    const content = "<task>Do something</task><examples></examples>";
    const context = makeContext({
      approvedTags: [
        makeTag("task", "required"),
        makeTag("examples", "optional"),
      ],
    });
    const result = runVerification(content, context);
    expect(result.status).toBe("warnings");
  });

  it("should include anti-pattern scan results", () => {
    const content = "<task>Do</task><examples></examples>";
    const context = makeContext({
      approvedTags: [
        makeTag("task", "required"),
        makeTag("examples", "optional"),
      ],
    });
    const result = runVerification(content, context);
    const emptyAccum = result.anti_pattern_scan.find(
      (a) => a.pattern === "Empty Section Accumulation",
    );
    expect(emptyAccum).toBeDefined();
    expect(emptyAccum!.detected).toBe(true);
  });

  it("should detect tag sprawl anti-pattern", () => {
    // Create content with more than 12 unique tag types
    const tags = Array.from({ length: 13 }, (_, i) => `tag${i}`);
    const content = tags.map((t) => `<${t}>content</${t}>`).join("\n");
    const approvedTags = tags.map((t) => makeTag(t, "optional"));
    const context = makeContext({ approvedTags });
    const result = runVerification(content, context);
    const tagSprawl = result.anti_pattern_scan.find(
      (a) => a.pattern === "Tag Sprawl",
    );
    expect(tagSprawl).toBeDefined();
    expect(tagSprawl!.detected).toBe(true);
  });

  it("should have score between 0 and 100", () => {
    const content = "<unknown>$a $b $c $d $e</unknown><empty></empty>";
    const result = runVerification(content, makeContext());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
