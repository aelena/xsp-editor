import type {
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import type { Tag } from '../api/tags.ts'

export function buildTagCompletion(tags: Tag[]) {
  return function tagCompletion(
    context: CompletionContext,
  ): CompletionResult | null {
    // Match after '<' for opening tags or '</' for closing tags
    const openTag = context.matchBefore(/<\/?[\w_-]*/)
    if (!openTag) return null

    const text = openTag.text
    const isClosing = text.startsWith('</')

    const options = tags.map((tag) => ({
      label: tag.name,
      type: 'keyword' as const,
      info: tag.purpose,
      apply: isClosing
        ? `${tag.name}>`
        : `${tag.name}></${tag.name}>`,
      boost: tag.enforcement === 'required' ? 2
        : tag.enforcement === 'recommended' ? 1
          : tag.enforcement === 'deprecated' ? -1
            : 0,
    }))

    return {
      from: openTag.from + (isClosing ? 2 : 1),
      options,
      validFor: /^[\w_-]*$/,
    }
  }
}

// Find position in document for a given check rule
export function findCheckPosition(
  doc: string,
  rule: string,
  message: string,
): { from: number; to: number } {
  // Try to extract a tag name from the message
  const tagMatch = message.match(/<(\w[\w_-]*)>/)
  if (tagMatch) {
    const tagName = tagMatch[1]
    // Find the tag in the document
    const tagRegex = new RegExp(`<${tagName}[\\s>]`)
    const match = tagRegex.exec(doc)
    if (match) {
      return { from: match.index, to: match.index + match[0].length }
    }
  }

  // For variable_docs, try to find the variable
  if (rule === 'variable_docs') {
    const varMatch = message.match(/\$(\w+)/)
    if (varMatch) {
      const idx = doc.indexOf(`$${varMatch[1]}`)
      if (idx >= 0) {
        return { from: idx, to: idx + varMatch[0].length }
      }
    }
  }

  // For pseudo_programming, find the offending tag
  if (rule === 'pseudo_programming') {
    const pseudoTags = ['if', 'else', 'for-each', 'when', 'set']
    for (const tag of pseudoTags) {
      const idx = doc.indexOf(`<${tag}`)
      if (idx >= 0) {
        return { from: idx, to: Math.min(idx + tag.length + 2, doc.length) }
      }
    }
  }

  // Default: mark the first line
  const firstLineEnd = doc.indexOf('\n')
  return { from: 0, to: firstLineEnd > 0 ? firstLineEnd : Math.min(doc.length, 1) }
}
