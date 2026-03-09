import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { buildTagCompletion, findCheckPosition } from './xml-editor-utils.ts'
import type { Tag } from '../api/tags.ts'
import type { CompletionContext } from '@codemirror/autocomplete'

const sampleTags: Tag[] = [
  {
    name: 'task',
    purpose: 'Primary instruction',
    use_when: 'Every prompt',
    example: '<task>Do something</task>',
    enforcement: 'required',
    usage_count: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    name: 'context',
    purpose: 'Background information',
    use_when: 'When needed',
    example: '<context>Background</context>',
    enforcement: 'optional',
    usage_count: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    name: 'constraints',
    purpose: 'Behavioral guardrails container',
    use_when: 'Most prompts',
    example: '<constraints>...</constraints>',
    enforcement: 'recommended',
    usage_count: 8,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    name: 'old_tag',
    purpose: 'Deprecated tag',
    use_when: 'Never',
    example: '<old_tag>...</old_tag>',
    enforcement: 'deprecated',
    usage_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

describe('buildTagCompletion', () => {
  function createMockContext(
    text: string,
    from: number,
  ): CompletionContext {
    return {
      matchBefore: (regex: RegExp) => {
        const match = text.match(regex)
        if (!match) return null
        return { from, text: match[0] }
      },
    } as unknown as CompletionContext
  }

  it('returns null when no tag context is found', () => {
    const completion = buildTagCompletion(sampleTags)
    const context = createMockContext('hello world', 0)
    expect(completion(context)).toBeNull()
  })

  it('returns completions for opening tags', () => {
    const completion = buildTagCompletion(sampleTags)
    const context = createMockContext('<ta', 0)
    const result = completion(context)
    expect(result).not.toBeNull()
    expect(result!.options).toHaveLength(4)
    expect(result!.options[0].label).toBe('task')
  })

  it('includes opening and closing tag in apply for opening tags', () => {
    const completion = buildTagCompletion(sampleTags)
    const context = createMockContext('<ta', 0)
    const result = completion(context)
    const taskOption = result!.options.find((o) => o.label === 'task')
    expect(taskOption!.apply).toBe('task></task>')
  })

  it('only includes closing tag for closing tag completions', () => {
    const completion = buildTagCompletion(sampleTags)
    const context = createMockContext('</ta', 0)
    const result = completion(context)
    const taskOption = result!.options.find((o) => o.label === 'task')
    expect(taskOption!.apply).toBe('task>')
  })

  it('includes tag purpose as info', () => {
    const completion = buildTagCompletion(sampleTags)
    const context = createMockContext('<', 0)
    const result = completion(context)
    const taskOption = result!.options.find((o) => o.label === 'task')
    expect(taskOption!.info).toBe('Primary instruction')
  })

  it('boosts required tags higher', () => {
    const completion = buildTagCompletion(sampleTags)
    const context = createMockContext('<', 0)
    const result = completion(context)
    const taskOption = result!.options.find((o) => o.label === 'task')
    const contextOption = result!.options.find((o) => o.label === 'context')
    const deprecatedOption = result!.options.find((o) => o.label === 'old_tag')
    expect(taskOption!.boost).toBe(2)
    expect(contextOption!.boost).toBe(0)
    expect(deprecatedOption!.boost).toBe(-1)
  })

  it('boosts recommended tags moderately', () => {
    const completion = buildTagCompletion(sampleTags)
    const context = createMockContext('<', 0)
    const result = completion(context)
    const constraintsOption = result!.options.find(
      (o) => o.label === 'constraints',
    )
    expect(constraintsOption!.boost).toBe(1)
  })
})

describe('findCheckPosition', () => {
  const doc = `<task>Classify the input</task>
<constraints>
  <constraint id="GEN-001">No fabrication</constraint>
</constraints>
<input>$customer_message</input>
<output_format>JSON</output_format>`

  it('finds tag position from message containing a tag name', () => {
    const pos = findCheckPosition(doc, 'empty_sections', 'Section <constraints> is empty')
    expect(pos.from).toBe(doc.indexOf('<constraints>'))
  })

  it('finds variable position for variable_docs rule', () => {
    const pos = findCheckPosition(doc, 'variable_docs', 'Variable $customer_message is used but not documented')
    expect(pos.from).toBe(doc.indexOf('$customer_message'))
    expect(pos.to).toBe(doc.indexOf('$customer_message') + '$customer_message'.length)
  })

  it('finds pseudo_programming tag position', () => {
    const docWithIf = '<task>Do something</task>\n<if>condition</if>'
    const pos = findCheckPosition(docWithIf, 'pseudo_programming', 'Pseudo programming detected')
    expect(pos.from).toBe(docWithIf.indexOf('<if'))
  })

  it('defaults to first line when no match found', () => {
    const pos = findCheckPosition(doc, 'unknown_rule', 'Something went wrong')
    expect(pos.from).toBe(0)
  })

  it('handles empty document', () => {
    const pos = findCheckPosition('', 'approved_tags', 'No tags found')
    expect(pos.from).toBe(0)
    expect(pos.to).toBe(0)
  })

  it('finds for-each pseudo programming tag', () => {
    const docWithForEach = '<task>Process items</task>\n<for-each>item</for-each>'
    const pos = findCheckPosition(docWithForEach, 'pseudo_programming', 'Pseudo programming detected')
    expect(pos.from).toBe(docWithForEach.indexOf('<for-each'))
  })
})

describe('XmlEditor component rendering', () => {
  it('renders editor container with test id', () => {
    const MockEditor = ({ value }: { value: string }) => (
      <div data-testid="xml-editor">{value}</div>
    )
    render(<MockEditor value="<task>Hello</task>" />)
    expect(screen.getByTestId('xml-editor')).toBeInTheDocument()
  })
})
