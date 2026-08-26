import { describe, it, expect } from "vitest";
import { renderTemplate } from "./renderer.js";

describe("renderTemplate", () => {
  it("substitutes a variable", () => {
    expect(renderTemplate("Hello $name", { name: "Antonio" }).rendered).toBe("Hello Antonio");
  });

  it("substitutes every occurrence", () => {
    expect(renderTemplate("$a and $a again", { a: "x" }).rendered).toBe("x and x again");
  });

  it("leaves a variable nobody supplied in place, and reports it", () => {
    // Silently emptying it would send a prompt with a hole in it to a model,
    // and the hole is invisible in the output.
    const result = renderTemplate("Hello $name from $place", { name: "Antonio" });
    expect(result.rendered).toBe("Hello Antonio from $place");
    expect(result.unresolved_variables).toEqual(["place"]);
  });

  it("reports nothing unresolved when everything is supplied", () => {
    expect(renderTemplate("$a$b", { a: "1", b: "2" }).unresolved_variables).toEqual([]);
  });

  it("ignores a supplied value the template never asks for", () => {
    const result = renderTemplate("no variables here", { unused: "x" });
    expect(result.rendered).toBe("no variables here");
    expect(result.unresolved_variables).toEqual([]);
  });

  it("does not treat $& in a value as a backreference", () => {
    // String.replace expands $&, $1 and friends inside the replacement. A
    // variable holding a dollar sign would otherwise inject part of the
    // template back into itself.
    expect(renderTemplate("value: $x", { x: "$&" }).rendered).toBe("value: $&");
    expect(renderTemplate("value: $x", { x: "$1 $` $'" }).rendered).toBe("value: $1 $` $'");
  });

  it("substitutes a value containing another variable without re-expanding it", () => {
    // One pass, so a value that looks like a placeholder stays literal. The
    // alternative is a template that can be made to expand itself.
    const result = renderTemplate("$a", { a: "$b", b: "should not appear" });
    expect(result.rendered).toBe("$b");
  });

  it("respects the word boundary", () => {
    // $name and $namespace are different variables, and a prefix match would
    // turn the longer one into the shorter one's value plus leftovers.
    const result = renderTemplate("$name and $namespace", {
      name: "A",
      namespace: "B",
    });
    expect(result.rendered).toBe("A and B");
  });

  it("does not substitute a partial name", () => {
    const result = renderTemplate("$namespace", { name: "A" });
    expect(result.rendered).toBe("$namespace");
    expect(result.unresolved_variables).toEqual(["namespace"]);
  });

  it("ignores a bare dollar that starts no name", () => {
    const result = renderTemplate("costs $5 and $ alone", {});
    expect(result.rendered).toBe("costs $5 and $ alone");
    expect(result.unresolved_variables).toEqual([]);
  });

  it("accepts underscores and digits inside a name", () => {
    expect(renderTemplate("$user_id_2", { user_id_2: "ok" }).rendered).toBe("ok");
  });

  it("reports each unresolved variable once", () => {
    expect(renderTemplate("$a $a $a", {}).unresolved_variables).toEqual(["a"]);
  });

  it("survives an empty template", () => {
    expect(renderTemplate("", {})).toEqual({
      rendered: "",
      token_estimate: 0,
      unresolved_variables: [],
    });
  });

  it("substitutes an empty value, which is different from not supplying one", () => {
    const result = renderTemplate("[$a]", { a: "" });
    expect(result.rendered).toBe("[]");
    expect(result.unresolved_variables).toEqual([]);
  });

  it("estimates tokens from the rendered text, not the template", () => {
    // The estimate exists to tell someone what they are about to send. Counting
    // the template would understate a long value and overstate a short one.
    const short = renderTemplate("$a", { a: "x" });
    const long = renderTemplate("$a", { a: "x".repeat(400) });

    expect(short.token_estimate).toBeLessThan(long.token_estimate);
    expect(long.token_estimate).toBe(100);
  });

  it("handles XML content without mangling it", () => {
    const result = renderTemplate(
      "<task>$instruction</task>\n<input><![CDATA[$payload]]></input>",
      { instruction: "Classify", payload: "a & b < c" },
    );
    expect(result.rendered).toBe(
      "<task>Classify</task>\n<input><![CDATA[a & b < c]]></input>",
    );
  });
});
