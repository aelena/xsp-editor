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

// --- Phase 1 Rules ---

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
  const sectionRegex = /<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>(\s*)<\/\1>/gi;
  const emptySections: string[] = [];
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const innerContent = match[2];
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
  const tagEventRegex = /<\/?([a-z_][a-z0-9_]*)[^>]*>/gi;
  let depth = 0;
  let maxDepth = 0;
  let match;

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

// --- Phase 1 Additional Rules ---

export function checkCdataForInput(content: string): CheckResult {
  // Check if <input> or <untrusted_input> tags use CDATA wrappers
  const inputRegex = /<(input|untrusted_input)[^>]*>([\s\S]*?)<\/\1>/gi;
  const withoutCdata: string[] = [];
  let match;

  while ((match = inputRegex.exec(content)) !== null) {
    const tagName = match[1];
    const inner = match[2];
    if (!inner.includes("<![CDATA[")) {
      withoutCdata.push(tagName);
    }
  }

  if (withoutCdata.length === 0) {
    return {
      rule: "cdata_for_input",
      status: "passed",
      message: "All input sections use CDATA wrappers",
    };
  }

  return {
    rule: "cdata_for_input",
    status: "warning",
    message: `Input sections without CDATA: ${withoutCdata.join(", ")} — wrap user content in <![CDATA[...]]>`,
  };
}

export function checkConstraintCount(content: string): CheckResult {
  const constraintRegex = /<constraint[\s>]/gi;
  let count = 0;
  while (constraintRegex.exec(content) !== null) count++;

  const limit = 15;
  if (count <= limit) {
    return {
      rule: "constraint_count",
      status: "passed",
      message: `${count} constraints found (limit: ${limit})`,
    };
  }

  return {
    rule: "constraint_count",
    status: "warning",
    message: `${count} constraints found — exceeds recommended limit of ${limit}`,
    anti_pattern: "Over-Specification",
  };
}

export function checkTagCount(content: string): CheckResult {
  const tagsUsed = extractTags(content);
  const limit = 12;

  if (tagsUsed.length <= limit) {
    return {
      rule: "tag_count",
      status: "passed",
      message: `${tagsUsed.length} unique tag types (limit: ${limit})`,
    };
  }

  return {
    rule: "tag_count",
    status: "warning",
    message: `${tagsUsed.length} unique tag types — exceeds recommended limit of ${limit}`,
    anti_pattern: "Tag Sprawl",
  };
}

export function checkOutputFormatPresent(content: string): CheckResult {
  const hasOutputFormat = /<output_format[\s>]/i.test(content);
  const hasOutputContract = /<output_contract[\s>]/i.test(content);

  if (hasOutputFormat || hasOutputContract) {
    return {
      rule: "output_format_present",
      status: "passed",
      message: "Output format/contract is defined",
    };
  }

  return {
    rule: "output_format_present",
    status: "warning",
    message: "No <output_format> or <output_contract> tag found — consider specifying expected output shape",
  };
}

// --- Phase 4: Advanced Rules ---

export function checkPseudoProgramming(content: string): CheckResult {
  const programmingTags = ["if", "else", "for-each", "when", "set", "switch", "case", "while", "loop"];
  const tagsUsed = extractTags(content);
  const found = tagsUsed.filter((t) => programmingTags.includes(t));

  if (found.length === 0) {
    return {
      rule: "pseudo_programming",
      status: "passed",
      message: "No pseudo-programming tags detected",
    };
  }

  return {
    rule: "pseudo_programming",
    status: "failed",
    message: `Pseudo-programming tags detected: <${found.join(">, <")}>. XML prompts are not programs — use natural language instead.`,
    anti_pattern: "Pseudo-Programming",
  };
}

export function checkRedundantNesting(content: string): CheckResult {
  // Detect patterns like <config><task_config><primary_task> — deeply nested wrappers
  // Heuristic: find chains of 3+ nested tags where each has only one child element
  const patterns: string[] = [];

  // Find tags that contain only a single child tag (plus whitespace)
  const singleChildRegex = /<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>[\s]*<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>[\s]*<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>/gi;
  let match;

  while ((match = singleChildRegex.exec(content)) !== null) {
    const [, outer, middle, inner] = match;
    // Check if this looks like redundant wrapper nesting
    if (outer !== middle && middle !== inner) {
      patterns.push(`<${outer}><${middle}><${inner}>`);
    }
  }

  if (patterns.length === 0) {
    return {
      rule: "redundant_nesting",
      status: "passed",
      message: "No redundant nesting patterns detected",
    };
  }

  return {
    rule: "redundant_nesting",
    status: "warning",
    message: `Possible redundant nesting: ${patterns[0]} — consider flattening`,
    anti_pattern: "Redundant Nesting",
    details: patterns.join(", "),
  };
}

export function checkConstraintConflicts(content: string): CheckResult {
  const contentLower = content.toLowerCase();

  // Pairs of conflicting directives (heuristic)
  const conflictPairs: [RegExp, RegExp, string][] = [
    [/\bcomprehensive\b/, /\bmax\s+\d+\s+words?\b/, "\"be comprehensive\" vs word limit"],
    [/\bdetailed\b/, /\bbrief\b/, "\"detailed\" vs \"brief\""],
    [/\bexhaustive\b/, /\bconcise\b/, "\"exhaustive\" vs \"concise\""],
    [/\ball\s+possible\b/, /\blimit\b/, "\"all possible\" vs \"limit\""],
    [/\bno\s+preamble\b/, /\bexplain\s+your\s+reasoning\b/, "\"no preamble\" vs \"explain reasoning\""],
  ];

  const conflicts: string[] = [];
  for (const [a, b, desc] of conflictPairs) {
    if (a.test(contentLower) && b.test(contentLower)) {
      conflicts.push(desc);
    }
  }

  if (conflicts.length === 0) {
    return {
      rule: "constraint_conflicts",
      status: "passed",
      message: "No obvious constraint conflicts detected",
    };
  }

  return {
    rule: "constraint_conflicts",
    status: "warning",
    message: `Possible conflicting constraints: ${conflicts.join("; ")}`,
    anti_pattern: "Constraint Conflicts",
  };
}

export function checkExampleOverload(content: string): CheckResult {
  const exampleRegex = /<example[\s>]/gi;
  let count = 0;
  while (exampleRegex.exec(content) !== null) count++;

  // Nested <example> inside <examples> is expected, so divide by 2 if we have <examples> wrapper
  // Actually, just count opening <example> tags (not <examples>)
  const exactExampleRegex = /<example(?:\s[^>]*)?>(?!s)/gi;
  let exactCount = 0;
  while (exactExampleRegex.exec(content) !== null) exactCount++;

  const limit = 5;
  if (exactCount <= limit) {
    return {
      rule: "example_overload",
      status: "passed",
      message: `${exactCount} examples found (limit: ${limit})`,
    };
  }

  return {
    rule: "example_overload",
    status: "warning",
    message: `${exactCount} examples found — more than ${limit} may waste tokens without improving accuracy`,
    anti_pattern: "Example Overload",
  };
}

export function checkOverSpecification(content: string): CheckResult {
  // Composite score based on multiple signals
  let signals = 0;

  const tagsUsed = extractTags(content);
  if (tagsUsed.length > 10) signals++;
  if (tagsUsed.length > 15) signals++;

  // Count total constraint tags
  const constraintCount = (content.match(/<constraint[\s>]/gi) || []).length;
  if (constraintCount > 10) signals++;
  if (constraintCount > 20) signals++;

  // Check total content length (proxy for over-specification)
  if (content.length > 5000) signals++;
  if (content.length > 10000) signals++;

  // Many nested sections
  const nestingCheck = checkNestingDepth(content);
  if (nestingCheck.status === "warning") signals++;

  if (signals <= 1) {
    return {
      rule: "over_specification",
      status: "passed",
      message: "Prompt complexity is within reasonable bounds",
    };
  }

  if (signals <= 3) {
    return {
      rule: "over_specification",
      status: "warning",
      message: `Over-specification risk (${signals}/7 signals): prompt may be overly complex — consider simplifying`,
      anti_pattern: "Over-Specification",
    };
  }

  return {
    rule: "over_specification",
    status: "failed",
    message: `High over-specification risk (${signals}/7 signals): prompt is likely too complex for reliable execution`,
    anti_pattern: "Over-Specification",
  };
}

// --- Main verification runner ---

export function runVerification(
  content: string,
  context: VerificationContext,
): VerificationResult {
  const checks: CheckResult[] = [
    // Phase 1 core rules
    checkApprovedTags(content, context),
    checkRequiredTags(content, context),
    checkEmptySections(content),
    checkNestingDepth(content),
    checkVariableDocs(content, context),
    // Phase 1 additional rules
    checkCdataForInput(content),
    checkConstraintCount(content),
    checkTagCount(content),
    checkOutputFormatPresent(content),
    // Phase 4 advanced rules
    checkPseudoProgramming(content),
    checkRedundantNesting(content),
    checkConstraintConflicts(content),
    checkExampleOverload(content),
    checkOverSpecification(content),
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
    if (check.status === "failed") score -= 15;
    else if (check.status === "warning") score -= 5;
  }
  score = Math.max(0, score);

  // Anti-pattern scan
  const antiPatterns = [
    "Tag Sprawl",
    "Empty Section Accumulation",
    "Over-Specification",
    "Pseudo-Programming",
    "Redundant Nesting",
    "Constraint Conflicts",
    "Example Overload",
  ];

  const antiPatternScan: AntiPatternResult[] = antiPatterns.map((pattern) => {
    const matchingCheck = checks.find((c) => c.anti_pattern === pattern);
    return {
      pattern,
      detected: !!matchingCheck && matchingCheck.status !== "passed",
      ...(matchingCheck?.details ? { details: matchingCheck.details } : {}),
    };
  });

  return { status, score, checks, anti_pattern_scan: antiPatternScan };
}
