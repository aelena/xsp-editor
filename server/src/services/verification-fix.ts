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

/**
 * Remove empty XML elements: <tag></tag> or <tag attr="x">  </tag>
 */
export function fixEmptySections(content: string): string {
  // Match empty elements (tag with optional attributes, whitespace-only content)
  const emptyTagRegex = /<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>\s*<\/\1>/gi;
  return content.replace(emptyTagRegex, "");
}

/**
 * Wrap content of <input> and <untrusted_input> in CDATA if not already.
 */
export function fixCdataForInput(content: string): string {
  const inputRegex = /<(input|untrusted_input)([^>]*)>([\s\S]*?)<\/\1>/gi;
  return content.replace(inputRegex, (_, tagName, attrs, inner) => {
    const trimmed = inner.trim();
    if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
      return `<${tagName}${attrs}>${inner}</${tagName}>`;
    }
    return `<${tagName}${attrs}><![CDATA[${inner}]]></${tagName}>`;
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
    if (!result[name] || !result[name].description) {
      result[name] = result[name]
        ? { ...result[name], description: result[name].description || stub.description }
        : stub;
    }
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
