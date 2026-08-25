import { describe, it, expect } from "vitest";
import {
  fixEmptySections,
  fixCdataForInput,
  fixVariableDocs,
  isRuleBasedFixable,
  applyVerificationFix,
} from "./verification-fix.js";

describe("fixEmptySections", () => {
  it("removes an element with nothing in it", () => {
    expect(fixEmptySections("<task>Do it</task><context></context>")).toBe(
      "<task>Do it</task>",
    );
  });

  it("removes an element holding only whitespace", () => {
    expect(fixEmptySections("<a>keep</a><b>   \n  </b>")).toBe("<a>keep</a>");
  });

  it("keeps attributes out of the decision", () => {
    expect(fixEmptySections('<note id="1" class="x"></note>')).toBe("");
  });

  it("leaves elements that have content", () => {
    const content = "<task>Summarise</task>";
    expect(fixEmptySections(content)).toBe(content);
  });

  it("does not touch text inside CDATA", () => {
    // CDATA means "treat this as raw text". A user pasting a document that
    // happens to contain an empty tag is not asking for their document to be
    // edited, and silently deleting from it is worse than leaving a warning up.
    const content = "<input><![CDATA[<empty></empty> real data]]></input>";
    expect(fixEmptySections(content)).toBe(content);
  });
});

describe("fixCdataForInput", () => {
  it("wraps unwrapped input content", () => {
    expect(fixCdataForInput("<input>raw text</input>")).toBe(
      "<input><![CDATA[raw text]]></input>",
    );
  });

  it("wraps untrusted_input as well", () => {
    expect(fixCdataForInput("<untrusted_input>hi</untrusted_input>")).toBe(
      "<untrusted_input><![CDATA[hi]]></untrusted_input>",
    );
  });

  it("does not wrap twice", () => {
    const content = "<input><![CDATA[already]]></input>";
    expect(fixCdataForInput(content)).toBe(content);
  });

  it("preserves attributes on the tag", () => {
    expect(fixCdataForInput('<input source="user">x</input>')).toBe(
      '<input source="user"><![CDATA[x]]></input>',
    );
  });

  it("leaves other tags alone", () => {
    const content = "<task>not an input</task>";
    expect(fixCdataForInput(content)).toBe(content);
  });

  it("escapes a CDATA terminator appearing in the content", () => {
    // The one sequence that cannot appear inside a CDATA section is its own
    // terminator. Wrapping content containing "]]>" without splitting it ends
    // the section early, and everything after it stops being quoted: the exact
    // failure the wrapper was added to prevent.
    const fixed = fixCdataForInput("<input>a ]]> b</input>");

    expect(fixed).not.toContain("<![CDATA[a ]]> b]]>");
    // Split across two sections, which is how XML expresses a literal ]]>.
    expect(fixed).toBe("<input><![CDATA[a ]]]]><![CDATA[> b]]></input>");
  });
});

describe("fixVariableDocs", () => {
  it("adds a stub for each undocumented variable named in the message", () => {
    const result = fixVariableDocs({}, "Undocumented variables: $foo, $bar");

    expect(result.foo).toEqual({ description: "Template variable", required: true });
    expect(result.bar).toEqual({ description: "Template variable", required: true });
  });

  it("leaves a documented variable untouched", () => {
    const existing = { foo: { description: "The real thing", required: false } };
    const result = fixVariableDocs(existing, "Undocumented variables: $bar");

    expect(result.foo).toEqual({ description: "The real thing", required: false });
    expect(result.bar.description).toBe("Template variable");
  });

  it("fills in a description without discarding the other fields", () => {
    const existing = { foo: { description: "", required: false } };
    const result = fixVariableDocs(existing, "Undocumented variables: $foo");

    expect(result.foo.description).toBe("Template variable");
    expect(result.foo.required).toBe(false);
  });

  it("returns the input unchanged when the message names no variables", () => {
    const existing = { foo: { description: "x" } };
    expect(fixVariableDocs(existing, "Nothing to see")).toEqual(existing);
  });

  it("does not mutate the object it was given", () => {
    const existing = {};
    fixVariableDocs(existing, "Undocumented variables: $foo");
    expect(existing).toEqual({});
  });
});

describe("isRuleBasedFixable", () => {
  it("recognises the three rules that have a fix", () => {
    expect(isRuleBasedFixable("empty_sections")).toBe(true);
    expect(isRuleBasedFixable("cdata_for_input")).toBe(true);
    expect(isRuleBasedFixable("variable_docs")).toBe(true);
  });

  it("rejects rules that need a person", () => {
    expect(isRuleBasedFixable("required_tags")).toBe(false);
    expect(isRuleBasedFixable("pseudo_programming")).toBe(false);
    expect(isRuleBasedFixable("")).toBe(false);
  });
});

describe("applyVerificationFix", () => {
  it("returns new content for a content rule", () => {
    const result = applyVerificationFix("empty_sections", "<a></a><b>x</b>", "");
    expect(result.content).toBe("<b>x</b>");
    expect(result.variables).toBeUndefined();
  });

  it("returns new variables for the variables rule", () => {
    const result = applyVerificationFix(
      "variable_docs",
      "<task>$foo</task>",
      "Undocumented variables: $foo",
      {},
    );
    expect(result.variables?.foo.description).toBe("Template variable");
    expect(result.content).toBeUndefined();
  });

  it("throws for a rule with no rule-based fix", () => {
    expect(() =>
      applyVerificationFix("pseudo_programming", "<a/>", ""),
    ).toThrowError(/does not support/);
  });

  it("throws for variable_docs with no variables to work on", () => {
    // Falling through to the throw is correct here, but worth pinning: the
    // caller must pass the current variables, and silently returning an empty
    // fix would look like success.
    expect(() =>
      applyVerificationFix("variable_docs", "<a>$x</a>", "$x", undefined),
    ).toThrowError(/does not support/);
  });
});
