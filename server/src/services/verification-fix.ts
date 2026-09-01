/**
 * Rule-based fixes for verification warnings.
 * Phase 1: empty_sections, cdata_for_input, variable_docs.
 */

export interface FixVariablesInput {
  [key: string]: { description: string; required?: boolean };
}

export interface FixResult {
  content?: string;
  variables?: FixVariablesInput;
}

const CDATA_SECTION = /<!\[CDATA\[[\s\S]*?\]\]>/g;

/**
 * Apply a transformation to everything except CDATA sections.
 *
 * CDATA means "treat this as raw text". Someone pasting a document into <input>
 * is not asking for the document to be edited, so a fix that rewrites markup
 * must not reach inside one. Without this, an empty tag that happened to appear
 * in pasted data was silently deleted from it.
 */
function outsideCdata(
  content: string,
  transform: (chunk: string) => string,
): string {
  let out = "";
  let cursor = 0;

  for (const match of content.matchAll(CDATA_SECTION)) {
    const start = match.index ?? 0;
    out += transform(content.slice(cursor, start)) + match[0];
    cursor = start + match[0].length;
  }

  return out + transform(content.slice(cursor));
}

/**
 * Remove empty XML elements: <tag></tag> or <tag attr="x">  </tag>
 */
export function fixEmptySections(content: string): string {
  // Match empty elements (tag with optional attributes, whitespace-only content)
  const emptyTagRegex = /<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>\s*<\/\1>/gi;
  return outsideCdata(content, (chunk) => chunk.replace(emptyTagRegex, ""));
}

const EXAMPLE_BLOCK = /<(examples|example)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;

/**
 * Apply a transformation everywhere except inside few-shot example blocks.
 *
 * Mirrors outsideCdata above, for the same reason in a different place. The
 * <input> of an <example> is a demonstration the author wrote, not runtime
 * input from anybody, so the rules for untrusted data do not apply to it and
 * rewriting it is noise at best. The checker skips these blocks too.
 */
function outsideExamples(
  content: string,
  transform: (chunk: string) => string,
): string {
  let out = "";
  let cursor = 0;

  EXAMPLE_BLOCK.lastIndex = 0;
  let match;
  while ((match = EXAMPLE_BLOCK.exec(content)) !== null) {
    out += transform(content.slice(cursor, match.index));
    out += match[0];
    cursor = match.index + match[0].length;
  }
  return out + transform(content.slice(cursor));
}

/**
 * Wrap content of <input> and <untrusted_input> in CDATA if not already.
 */
export function fixCdataForInput(content: string): string {
  return outsideExamples(content, wrapInputsInCdata);
}

function wrapInputsInCdata(content: string): string {
  const inputRegex = /<(input|untrusted_input)([^>]*)>([\s\S]*?)<\/\1>/gi;
  return content.replace(inputRegex, (_, tagName, attrs, inner) => {
    const trimmed = inner.trim();
    if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
      return `<${tagName}${attrs}>${inner}</${tagName}>`;
    }
    // The one sequence that cannot appear inside a CDATA section is its own
    // terminator. Wrapping content containing "]]>" without splitting it ends
    // the section early and leaves everything after it unquoted, which is the
    // failure this wrapper exists to prevent. XML expresses a literal ]]> by
    // closing and reopening around it.
    const escaped = inner.replace(/\]\]>/g, "]]]]><![CDATA[>");
    return `<${tagName}${attrs}><![CDATA[${escaped}]]></${tagName}>`;
  });
}

/**
 * Add undocumented variables to the variables object with stub description.
 * Extracts variable names from message like "Undocumented variables: $foo, $bar"
 */
export function fixVariableDocs(
  variables: FixVariablesInput,
  message: string,
): FixVariablesInput {
  const varMatch = message.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g);
  if (!varMatch) return variables;

  const result = { ...variables };
  const stub = { description: "Template variable", required: true };

  for (const v of varMatch) {
    const name = v.slice(1); // remove $
    const existing = result[name];
    if (existing?.description) continue;

    // Inside this branch the description is known to be missing, so there was
    // never anything to preserve about it: the old `description || stub` could
    // only ever resolve to the stub. Anything else on the entry, `required` in
    // particular, belongs to the user and stays.
    result[name] = existing
      ? { ...existing, description: stub.description }
      : { ...stub };
  }

  return result;
}

const RULE_BASED_FIXABLE = new Set([
  "empty_sections",
  "cdata_for_input",
  "variable_docs",
]);

export function isRuleBasedFixable(rule: string): boolean {
  return RULE_BASED_FIXABLE.has(rule);
}

export function applyVerificationFix(
  rule: string,
  content: string,
  message: string,
  variables?: FixVariablesInput,
): FixResult {
  if (rule === "empty_sections") {
    return { content: fixEmptySections(content) };
  }
  if (rule === "cdata_for_input") {
    return { content: fixCdataForInput(content) };
  }
  if (rule === "variable_docs" && variables) {
    return { variables: fixVariableDocs(variables, message) };
  }
  throw new Error(`Rule "${rule}" does not support rule-based fix`);
}
