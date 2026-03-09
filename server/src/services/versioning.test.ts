import { describe, it, expect } from "vitest";
import {
  incrementVersion,
  extractTagsUsed,
  extractConstraintsReferenced,
  extractVariablesFromContent,
} from "./versioning.js";

describe("incrementVersion", () => {
  it("should increment patch version", () => {
    expect(incrementVersion("1.0.0", "patch")).toBe("1.0.1");
    expect(incrementVersion("2.3.5", "patch")).toBe("2.3.6");
  });

  it("should increment minor version and reset patch", () => {
    expect(incrementVersion("1.0.0", "minor")).toBe("1.1.0");
    expect(incrementVersion("2.3.5", "minor")).toBe("2.4.0");
  });

  it("should increment major version and reset minor/patch", () => {
    expect(incrementVersion("1.0.0", "major")).toBe("2.0.0");
    expect(incrementVersion("2.3.5", "major")).toBe("3.0.0");
  });

  it("should throw on invalid version", () => {
    expect(() => incrementVersion("invalid", "patch")).toThrow();
    expect(() => incrementVersion("1.0", "patch")).toThrow();
  });
});

describe("extractTagsUsed", () => {
  it("should extract tag names from XML content", () => {
    const content =
      '<task>Do something</task>\n<constraints>\n<constraint id="GEN-001">Rule</constraint>\n</constraints>';
    const tags = extractTagsUsed(content);
    expect(tags).toContain("task");
    expect(tags).toContain("constraints");
    expect(tags).toContain("constraint");
  });

  it("should deduplicate tags", () => {
    const content =
      "<task>First</task>\n<task>Second</task>";
    const tags = extractTagsUsed(content);
    expect(tags.filter((t) => t === "task")).toHaveLength(1);
  });

  it("should handle empty content", () => {
    expect(extractTagsUsed("")).toEqual([]);
  });
});

describe("extractConstraintsReferenced", () => {
  it("should extract constraint IDs", () => {
    const content =
      '<constraint id="GEN-001">Rule 1</constraint>\n<constraint id="MED-001">Rule 2</constraint>';
    const ids = extractConstraintsReferenced(content);
    expect(ids).toContain("GEN-001");
    expect(ids).toContain("MED-001");
  });

  it("should handle content with no constraints", () => {
    expect(extractConstraintsReferenced("<task>Hello</task>")).toEqual([]);
  });
});

describe("extractVariablesFromContent", () => {
  it("should extract $variable placeholders", () => {
    const content = "<task>Process $input and generate $output</task>";
    const vars = extractVariablesFromContent(content);
    expect(vars).toContain("input");
    expect(vars).toContain("output");
  });

  it("should deduplicate variables", () => {
    const content = "$name is $name";
    const vars = extractVariablesFromContent(content);
    expect(vars).toHaveLength(1);
  });

  it("should handle content with no variables", () => {
    expect(extractVariablesFromContent("<task>Hello</task>")).toEqual([]);
  });
});
