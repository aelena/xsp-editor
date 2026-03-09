import type { TagRecord } from "../schemas/tags.js";

export interface VerificationContext {
  approvedTags: TagRecord[];
  documentedVariables: Record<string, { description: string; required?: boolean }>;
}

export interface CheckResult {
  rule: string;
  status: "passed" | "warning" | "failed";
  message: string;
  anti_pattern?: string;
  details?: string;
}

export interface AntiPatternResult {
  pattern: string;
  detected: boolean;
  details?: string;
}

export interface VerificationResult {
  status: "passed" | "warnings" | "failed";
  score: number;
  checks: CheckResult[];
  anti_pattern_scan: AntiPatternResult[];
}

function extractTags(content: string): string[] {
  const tagRegex = /<([a-z_][a-z0-9_]*)[^>]*>/gi;
  const tags = new Set<string>();
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag !== "xml" && !tag.startsWith("!")) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

function extractVariables(content: string): string[] {
  const varRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const vars = new Set<string>();
  let match;
  while ((match = varRegex.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

export function checkApprovedTags(content: string, context: VerificationContext): CheckResult {
  const tagsUsed = extractTags(content);
  const approvedNames = new Set(context.approvedTags.map((t) => t.name));

  if (approvedNames.size === 0) {
    return {
      rule: "approved_tags",
      status: "passed",
      message: "No tags in registry to check against",
    };
  }

  // Check for deprecated tags first (they are in the registry but deprecated)
  const deprecatedNames = new Set(
    context.approvedTags.filter((t) => t.enforcement === "deprecated").map((t) => t.name),
  );
  const usedDeprecated = tagsUsed.filter((t) => deprecatedNames.has(t));

  if (usedDeprecated.length > 0) {
    return {
      rule: "approved_tags",
      status: "warning",
      message: `Deprecated tags used: ${usedDeprecated.join(", ")}`,
    };
  }

  // Check for unapproved tags
  const unapproved = tagsUsed.filter((t) => !approvedNames.has(t));

  if (unapproved.length === 0) {
    return {
      rule: "approved_tags",
      status: "passed",
      message: "All tags are in the approved registry",
    };
  }

  return {
    rule: "approved_tags",
    status: "warning",
    message: `Unapproved tags found: ${unapproved.join(", ")}`,
  };
}

export function checkRequiredTags(content: string, context: VerificationContext): CheckResult {
  const requiredTags = context.approvedTags
    .filter((t) => t.enforcement === "required")
    .map((t) => t.name);

  if (requiredTags.length === 0) {
    return {
      rule: "required_tags",
      status: "passed",
      message: "No required tags defined in registry",
    };
  }

  const tagsUsed = new Set(extractTags(content));
  const missing = requiredTags.filter((t) => !tagsUsed.has(t));

  if (missing.length === 0) {
    return {
      rule: "required_tags",
      status: "passed",
      message: `All required tags are present: ${requiredTags.join(", ")}`,
    };
  }

  return {
    rule: "required_tags",
    status: "failed",
    message: `Missing required tags: ${missing.join(", ")}`,
  };
}

export function checkEmptySections(content: string): CheckResult {
  // Match open tag, capture content, match close tag
  const sectionRegex = /<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>(\s*)<\/\1>/gi;
  const emptySections: string[] = [];
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const innerContent = match[2];
    // Only whitespace or empty inside
    if (innerContent.trim() === "") {
      emptySections.push(tagName);
    }
  }

  if (emptySections.length === 0) {
    return {
      rule: "empty_sections",
      status: "passed",
      message: "No empty sections found",
    };
  }

  return {
    rule: "empty_sections",
    status: "warning",
    message: `Empty sections found: ${emptySections.join(", ")} — remove them or add content`,
    anti_pattern: "Empty Section Accumulation",
    details: `<${emptySections[0]}> section is empty`,
  };
}

export function checkNestingDepth(content: string): CheckResult {
  // Track nesting by walking through opening/closing tags
  const tagEventRegex = /<\/?([a-z_][a-z0-9_]*)[^>]*>/gi;
  let depth = 0;
  let maxDepth = 0;
  let match;

  // Self-closing tags won't affect depth since they both open and close
  const selfClosingRegex = /<([a-z_][a-z0-9_]*)[^>]*\/>/gi;
  const selfClosing = new Set<number>();

  let scMatch;
  while ((scMatch = selfClosingRegex.exec(content)) !== null) {
    selfClosing.add(scMatch.index);
  }

  while ((match = tagEventRegex.exec(content)) !== null) {
    if (selfClosing.has(match.index)) continue;
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    if (tagName === "xml" || tagName.startsWith("!")) continue;

    if (tag.startsWith("</")) {
      depth = Math.max(0, depth - 1);
    } else {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    }
  }

  const limit = 3;
  if (maxDepth <= limit) {
    return {
      rule: "nesting_depth",
      status: "passed",
      message: `Maximum nesting depth is ${maxDepth} (limit: ${limit})`,
    };
  }

  return {
    rule: "nesting_depth",
    status: "warning",
    message: `Maximum nesting depth is ${maxDepth} — exceeds limit of ${limit}`,
  };
}

export function checkVariableDocs(content: string, context: VerificationContext): CheckResult {
  const varsInContent = extractVariables(content);

  if (varsInContent.length === 0) {
    return {
      rule: "variable_docs",
      status: "passed",
      message: "No variables found in content",
    };
  }

  const documented = context.documentedVariables;
  const undocumented = varsInContent.filter(
    (v) => !documented[v] || !documented[v].description,
  );

  if (undocumented.length === 0) {
    return {
      rule: "variable_docs",
      status: "passed",
      message: `All ${varsInContent.length} variables are documented`,
    };
  }

  return {
    rule: "variable_docs",
    status: "failed",
    message: `Undocumented variables: ${undocumented.map((v) => `$${v}`).join(", ")}`,
  };
}

export function runVerification(
  content: string,
  context: VerificationContext,
): VerificationResult {
  const checks: CheckResult[] = [
    checkApprovedTags(content, context),
    checkRequiredTags(content, context),
    checkEmptySections(content),
    checkNestingDepth(content),
    checkVariableDocs(content, context),
  ];

  // Determine overall status
  const hasFailed = checks.some((c) => c.status === "failed");
  const hasWarning = checks.some((c) => c.status === "warning");
  const status: VerificationResult["status"] = hasFailed
    ? "failed"
    : hasWarning
      ? "warnings"
      : "passed";

  // Calculate score: start at 100, deduct for failures and warnings
  let score = 100;
  for (const check of checks) {
    if (check.status === "failed") score -= 20;
    else if (check.status === "warning") score -= 10;
  }
  score = Math.max(0, score);

  // Anti-pattern scan
  const tagsUsed = extractTags(content);
  const emptySectionCheck = checks.find((c) => c.rule === "empty_sections");

  const antiPatternScan: AntiPatternResult[] = [
    {
      pattern: "Tag Sprawl",
      detected: tagsUsed.length > 12,
      ...(tagsUsed.length > 12
        ? { details: `${tagsUsed.length} unique tag types found (limit: 12)` }
        : {}),
    },
    {
      pattern: "Empty Section Accumulation",
      detected: emptySectionCheck?.status === "warning",
      ...(emptySectionCheck?.status === "warning"
        ? { details: emptySectionCheck.details }
        : {}),
    },
  ];

  return { status, score, checks, anti_pattern_scan: antiPatternScan };
}
