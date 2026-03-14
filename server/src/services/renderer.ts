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

  // Substitute provided values (use function replacer to avoid
  // interpreting $& / $1 / etc. in the value as regex patterns)
  let rendered = content;
  for (const [key, value] of Object.entries(variables)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rendered = rendered.replace(
      new RegExp(`\\$${escaped}\\b`, "g"),
      () => value,
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
