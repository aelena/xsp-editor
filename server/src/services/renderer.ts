export interface RenderResult {
  rendered: string;
  token_estimate: number;
  unresolved_variables: string[];
}

const VARIABLE = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Substitute $variables in a template.
 *
 * One pass over the template, not one pass per variable.
 *
 * The sequential version had a real injection. It replaced each variable in
 * turn, so a value containing `$other` was still sitting in the string when
 * `other`'s turn came around, and got expanded. Untrusted text placed in one
 * variable could therefore pull in the contents of another, which for a tool
 * whose whole subject is keeping untrusted input inside its own element is the
 * wrong bug to have. It was order dependent too, so whether it happened came
 * down to the insertion order of an object.
 *
 * Scanning once and looking each name up means a substituted value is output
 * and never input again.
 */
export function renderTemplate(
  content: string,
  variables: Record<string, string>,
): RenderResult {
  const unresolved = new Set<string>();

  const rendered = content.replace(VARIABLE, (whole, name: string) => {
    // Own properties only. A variable named "constructor" or "toString" must
    // not resolve against Object.prototype and quietly render a function.
    if (!Object.hasOwn(variables, name)) {
      unresolved.add(name);
      return whole;
    }
    return variables[name];
  });

  // Rough estimate: about four characters per token for English text. Of the
  // rendered output rather than the template, because the point is telling
  // someone what they are about to send.
  const token_estimate = Math.ceil(rendered.length / 4);

  return { rendered, token_estimate, unresolved_variables: [...unresolved] };
}
