export interface RenderResult {
  rendered: string;
  token_estimate: number;
  unresolved_variables: string[];
}

export function renderTemplate(
  content: string,
  variables: Record<string, string>,
): RenderResult {
  const varRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const foundVars = new Set<string>();
  let match;

  // Collect all variables in the template
  while ((match = varRegex.exec(content)) !== null) {
    foundVars.add(match[1]);
  }

  // Substitute provided values
  let rendered = content;
  for (const [key, value] of Object.entries(variables)) {
    // Escape regex special characters in the key to prevent injection
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Escape '$' in the replacement value since it has special meaning in .replace()
    const safeValue = value.replace(/\$/g, "$$$$");
    rendered = rendered.replace(
      new RegExp(`\\$${escapedKey}\\b`, "g"),
      safeValue,
    );
  }

  // Find unresolved variables
  const unresolved: string[] = [];
  for (const v of foundVars) {
    if (!(v in variables)) {
      unresolved.push(v);
    }
  }

  // Rough token estimate: ~4 chars per token for English text
  const token_estimate = Math.ceil(rendered.length / 4);

  return { rendered, token_estimate, unresolved_variables: unresolved };
}
