import { describe, it, expect } from 'vitest'
import {
  fixEmptySections,
  fixRedundantNesting,
  fixPseudoProgramming,
  fixExampleOverload,
  fixCdataForInput,
} from './antipattern-fixes.ts'

describe('fixEmptySections', () => {
  it('removes empty tags', () => {
    const content = '<task>Do something</task>\n<examples></examples>'
    const fixed = fixEmptySections(content)
    expect(fixed).not.toBeNull()
    expect(fixed).not.toContain('<examples>')
    expect(fixed).toContain('<task>Do something</task>')
  })

  it('removes whitespace-only tags', () => {
    const content = '<task>Do</task>\n<input>   \n  </input>'
    const fixed = fixEmptySections(content)
    expect(fixed).not.toBeNull()
    expect(fixed).not.toContain('<input>')
  })

  it('returns null when no empty sections', () => {
    const content = '<task>Do something</task>\n<input>data</input>'
    expect(fixEmptySections(content)).toBeNull()
  })
})

describe('fixRedundantNesting', () => {
  it('flattens a 3-level nesting chain', () => {
    const content =
      '<examples>\n<example>\n<input>test data</input>\n</example>\n</examples>'
    const fixed = fixRedundantNesting(content)
    expect(fixed).not.toBeNull()
    expect(fixed).toContain('<examples>')
    expect(fixed).toContain('<input>test data</input>')
    expect(fixed).not.toContain('<example>')
  })

  it('returns null when no redundant nesting', () => {
    const content = '<task>Do something</task>'
    expect(fixRedundantNesting(content)).toBeNull()
  })
})

describe('fixPseudoProgramming', () => {
  it('unwraps pseudo-programming tags', () => {
    const content =
      '<task>Do</task>\n<if>condition is true</if>\n<else>fallback</else>'
    const fixed = fixPseudoProgramming(content)
    expect(fixed).not.toBeNull()
    expect(fixed).not.toContain('<if>')
    expect(fixed).not.toContain('<else>')
    expect(fixed).toContain('condition is true')
    expect(fixed).toContain('fallback')
  })

  it('returns null when no programming tags', () => {
    const content = '<task>Do something</task>'
    expect(fixPseudoProgramming(content)).toBeNull()
  })
})

describe('fixExampleOverload', () => {
  it('trims to 5 examples', () => {
    const examples = Array.from(
      { length: 7 },
      (_, i) => `<example>Example ${i + 1}</example>`,
    ).join('\n')
    const content = `<examples>\n${examples}\n</examples>`
    const fixed = fixExampleOverload(content)
    expect(fixed).not.toBeNull()
    // Count remaining <example> (not <examples>) tags
    const remaining = (fixed!.match(/<example>/g) || []).length
    expect(remaining).toBe(5)
    expect(fixed).toContain('Example 1')
    expect(fixed).toContain('Example 5')
    expect(fixed).not.toContain('Example 6')
  })

  it('returns null when 5 or fewer examples', () => {
    const content =
      '<examples><example>One</example><example>Two</example></examples>'
    expect(fixExampleOverload(content)).toBeNull()
  })
})

describe('fixCdataForInput', () => {
  it('wraps input content in CDATA', () => {
    const content = '<input>$user_message</input>'
    const fixed = fixCdataForInput(content)
    expect(fixed).not.toBeNull()
    expect(fixed).toContain('<![CDATA[$user_message]]>')
  })

  it('wraps untrusted_input content in CDATA', () => {
    const content = '<untrusted_input>$raw</untrusted_input>'
    const fixed = fixCdataForInput(content)
    expect(fixed).not.toBeNull()
    expect(fixed).toContain('<![CDATA[$raw]]>')
  })

  it('skips if already has CDATA', () => {
    const content = '<input><![CDATA[$user_message]]></input>'
    expect(fixCdataForInput(content)).toBeNull()
  })

  it('returns null when no input tags', () => {
    const content = '<task>Do something</task>'
    expect(fixCdataForInput(content)).toBeNull()
  })
})
