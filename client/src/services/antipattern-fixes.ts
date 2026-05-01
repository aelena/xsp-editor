/**
 * Auto-fix functions for detected anti-patterns.
 * Each function takes prompt content and returns the fixed content.
 * Returns null if no fix could be applied.
 */

/** Remove empty XML sections (tags with only whitespace inside) */
export function fixEmptySections(content: string): string | null {
  const emptyRegex = /<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>(\s*)<\/\1>/gi
  let fixed = content
  let found = false

  let match
  while ((match = emptyRegex.exec(content)) !== null) {
    if (match[2].trim() === '') {
      found = true
    }
  }

  if (!found) return null

  // Remove empty tags and any trailing blank line
  fixed = fixed.replace(
    /[ \t]*<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>(\s*)<\/\1>[ \t]*\n?/gi,
    (full, _tag, inner) => (inner.trim() === '' ? '' : full),
  )

  // Clean up multiple consecutive blank lines left behind
  fixed = fixed.replace(/\n{3,}/g, '\n\n')

  return fixed !== content ? fixed : null
}

/** Flatten redundant nesting: <a><b><c>...</c></b></a> → <a><c>...</c></a> (remove middle wrapper) */
export function fixRedundantNesting(content: string): string | null {
  // Find 3-level nesting chains where middle tag wraps a single child
  // Pattern: <outer>\s*<middle>\s*<inner>...</inner>\s*</middle>\s*</outer>
  const nestingRegex =
    /(<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>)\s*<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>(\s*(?:<([a-z_][a-z0-9_]*)(?:\s[^>]*)?>[\s\S]*?<\/\5>)\s*)<\/\3>\s*(<\/\2>)/gi

  let fixed = content
  let found = false

  fixed = fixed.replace(
    nestingRegex,
    (full, outerOpen, outerTag, middleTag, innerContent, innerTag, outerClose) => {
      if (outerTag === middleTag || middleTag === innerTag) return full
      found = true
      return `${outerOpen}\n${innerContent.trim()}\n${outerClose}`
    },
  )

  return found ? fixed : null
}

/** Replace pseudo-programming tags with their content as plain text */
export function fixPseudoProgramming(content: string): string | null {
  const programmingTags = [
    'if',
    'else',
    'for-each',
    'when',
    'set',
    'switch',
    'case',
    'while',
    'loop',
  ]
  const tagPattern = programmingTags.join('|')
  const regex = new RegExp(
    `<(${tagPattern})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`,
    'gi',
  )

  let found = false
  const fixed = content.replace(regex, (_full, _tag, inner) => {
    found = true
    return inner.trim()
  })

  return found ? fixed : null
}

/** Trim examples to keep only the first 5 */
export function fixExampleOverload(content: string): string | null {
  // Count <example> tags (not <examples>)
  const exampleRegex = /<example(?:\s[^>]*)?>(?!s)([\s\S]*?)<\/example>/gi
  const matches: { full: string; index: number }[] = []
  let match
  while ((match = exampleRegex.exec(content)) !== null) {
    matches.push({ full: match[0], index: match.index })
  }

  if (matches.length <= 5) return null

  // Remove examples after the 5th (from end to preserve indices)
  let fixed = content
  const toRemove = matches.slice(5).reverse()
  for (const m of toRemove) {
    // Also remove surrounding whitespace/newline
    const before = fixed.slice(0, m.index)
    const after = fixed.slice(m.index + m.full.length)
    fixed = before.trimEnd() + '\n' + after.trimStart()
  }

  return fixed
}

/** Wrap input/untrusted_input content in CDATA if missing */
export function fixCdataForInput(content: string): string | null {
  const inputRegex =
    /(<(?:input|untrusted_input)(?:\s[^>]*)?>)([\s\S]*?)(<\/(?:input|untrusted_input)>)/gi

  let found = false
  const fixed = content.replace(
    inputRegex,
    (full, openTag, inner, closeTag) => {
      if (inner.includes('<![CDATA[')) return full
      found = true
      const trimmed = inner.trim()
      return `${openTag}<![CDATA[${trimmed}]]>${closeTag}`
    },
  )

  return found ? fixed : null
}

export interface AntiPatternFix {
  pattern: string
  label: string
  apply: (content: string) => string | null
}

/** Registry of all available auto-fixes, keyed by anti-pattern name */
export const ANTIPATTERN_FIXES: AntiPatternFix[] = [
  {
    pattern: 'Empty Section Accumulation',
    label: 'Remove empty sections',
    apply: fixEmptySections,
  },
  {
    pattern: 'Redundant Nesting',
    label: 'Flatten nesting',
    apply: fixRedundantNesting,
  },
  {
    pattern: 'Pseudo-Programming',
    label: 'Unwrap to plain text',
    apply: fixPseudoProgramming,
  },
  {
    pattern: 'Example Overload',
    label: 'Trim to 5 examples',
    apply: fixExampleOverload,
  },
]

/** Non-antipattern check fixes (keyed by rule name) */
export interface CheckFix {
  rule: string
  label: string
  apply: (content: string) => string | null
}

export const CHECK_FIXES: CheckFix[] = [
  {
    rule: 'cdata_for_input',
    label: 'Wrap in CDATA',
    apply: fixCdataForInput,
  },
  {
    rule: 'empty_sections',
    label: 'Remove empty',
    apply: fixEmptySections,
  },
]
