export type VersionBump = "major" | "minor" | "patch";

export function incrementVersion(
  current: string,
  bump: VersionBump,
): string {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid SemVer: ${current}`);
  }
  const [major, minor, patch] = parts;
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

export function extractTagsUsed(content: string): string[] {
  const tagRegex = /<([a-z_][a-z0-9_]*)[^>]*>/gi;
  const tags = new Set<string>();
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    // Skip XML declarations and CDATA
    if (tag !== "xml" && !tag.startsWith("!")) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

export function extractConstraintsReferenced(content: string): string[] {
  const constraintRegex = /id=["']([A-Z]+-\d+)["']/g;
  const ids = new Set<string>();
  let match;
  while ((match = constraintRegex.exec(content)) !== null) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}

export function extractVariablesFromContent(content: string): string[] {
  const varRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const vars = new Set<string>();
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}
