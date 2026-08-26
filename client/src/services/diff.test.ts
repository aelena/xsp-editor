import { describe, it, expect } from 'vitest'
import { collapseUnchanged, diffLines, type DiffLine } from './diff.ts'

const kinds = (lines: DiffLine[]) => lines.map((l) => l.kind)
const texts = (lines: DiffLine[]) => lines.map((l) => `${l.kind === 'added' ? '+' : l.kind === 'removed' ? '-' : ' '}${l.text}`)

describe('diffLines', () => {
  it('reports identical text as identical', () => {
    const diff = diffLines('a\nb\nc', 'a\nb\nc')
    expect(diff.summary).toEqual({ added: 0, removed: 0, identical: true })
    expect(kinds(diff.lines)).toEqual(['same', 'same', 'same'])
  })

  it('finds a single added line', () => {
    const diff = diffLines('a\nc', 'a\nb\nc')
    expect(texts(diff.lines)).toEqual([' a', '+b', ' c'])
    expect(diff.summary).toEqual({ added: 1, removed: 0, identical: false })
  })

  it('finds a single removed line', () => {
    const diff = diffLines('a\nb\nc', 'a\nc')
    expect(texts(diff.lines)).toEqual([' a', '-b', ' c'])
    expect(diff.summary).toEqual({ added: 0, removed: 1, identical: false })
  })

  it('shows a replaced line as the old one then the new one', () => {
    // Every diff tool does it this way round, and a reader looking for what
    // changed reads the struck-out line first.
    const diff = diffLines('a\nold\nc', 'a\nnew\nc')
    expect(texts(diff.lines)).toEqual([' a', '-old', '+new', ' c'])
  })

  it('keeps unchanged lines as anchors rather than treating everything after a change as moved', () => {
    // The reason for the longest common subsequence instead of a line-by-line
    // walk: inserting one line at the top must not mark the whole file changed.
    const diff = diffLines('a\nb\nc\nd', 'new\na\nb\nc\nd')
    expect(diff.summary).toEqual({ added: 1, removed: 0, identical: false })
    expect(kinds(diff.lines)).toEqual(['added', 'same', 'same', 'same', 'same'])
  })

  it('handles a change in the middle of a long unchanged run', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`)
    const after = [...before]
    after[10] = 'changed'

    const diff = diffLines(before.join('\n'), after.join('\n'))
    expect(diff.summary.added).toBe(1)
    expect(diff.summary.removed).toBe(1)
  })

  it('handles going from empty to something', () => {
    const diff = diffLines('', 'a\nb')
    expect(diff.summary.added).toBeGreaterThan(0)
    expect(diff.summary.identical).toBe(false)
  })

  it('handles going from something to empty', () => {
    const diff = diffLines('a\nb', '')
    expect(diff.summary.removed).toBeGreaterThan(0)
  })

  it('treats two empty texts as identical', () => {
    expect(diffLines('', '').summary.identical).toBe(true)
  })

  it('numbers lines against their own side', () => {
    // A removal has no line in the new text and an addition has none in the old,
    // which is what lets the view show two gutters.
    const diff = diffLines('a\nb', 'a\nc')
    const removed = diff.lines.find((l) => l.kind === 'removed')!
    const added = diff.lines.find((l) => l.kind === 'added')!

    expect(removed.oldNumber).toBe(2)
    expect(removed.newNumber).toBeUndefined()
    expect(added.newNumber).toBe(2)
    expect(added.oldNumber).toBeUndefined()
  })

  it('does not lose a trailing newline difference', () => {
    // "a\n" and "a" are different files, and a diff that calls them identical
    // hides a change that matters to anything parsing the output.
    expect(diffLines('a', 'a\n').summary.identical).toBe(false)
  })

  it('handles XML content, which is what this is actually for', () => {
    const before = '<task>Classify</task>\n<input>$text</input>'
    const after = '<task>Classify the intent</task>\n<input>$text</input>'

    const diff = diffLines(before, after)
    expect(diff.summary).toEqual({ added: 1, removed: 1, identical: false })
    expect(diff.lines.find((l) => l.kind === 'same')?.text).toBe('<input>$text</input>')
  })

  it('reorders rather than rewriting when lines swap', () => {
    const diff = diffLines('a\nb', 'b\na')
    // One of the two moves; the other anchors. What matters is that it is not
    // reported as two changes to both lines.
    expect(diff.summary.added + diff.summary.removed).toBe(2)
  })
})

describe('collapseUnchanged', () => {
  const long = (changeAt: number, length = 30) => {
    const before = Array.from({ length }, (_, i) => `line ${i}`)
    const after = [...before]
    after[changeAt] = 'changed'
    return diffLines(before.join('\n'), after.join('\n')).lines
  }

  it('keeps a change and its surroundings', () => {
    const collapsed = collapseUnchanged(long(15), 3)
    const kept = collapsed.filter((l): l is DiffLine => l !== null)

    expect(kept.some((l) => l.text === 'changed')).toBe(true)
    expect(kept.some((l) => l.text === 'line 12')).toBe(true)
    expect(kept.some((l) => l.text === 'line 18')).toBe(true)
  })

  it('drops the lines far from any change', () => {
    // Forty identical lines between the reader and the edit is a reader who
    // stops looking.
    const collapsed = collapseUnchanged(long(15), 3)
    const kept = collapsed.filter((l): l is DiffLine => l !== null)

    expect(kept.some((l) => l.text === 'line 0')).toBe(false)
    expect(kept.length).toBeLessThan(long(15).length)
  })

  it('marks each gap once, however long it is', () => {
    // The marker is what lets the view draw a divider instead of pretending the
    // lines either side are adjacent.
    const collapsed = collapseUnchanged(long(15), 3)
    const gaps = collapsed.filter((l) => l === null)

    expect(gaps.length).toBe(2)
    expect(collapsed.indexOf(null)).toBe(0)
  })

  it('collapses nothing when everything is near a change', () => {
    const lines = diffLines('a\nb', 'c\nd').lines
    expect(collapseUnchanged(lines, 3).every((l) => l !== null)).toBe(true)
  })

  it('collapses an identical file to a single gap', () => {
    const same = diffLines('a\nb\nc', 'a\nb\nc').lines
    expect(collapseUnchanged(same, 3)).toEqual([null])
  })

  it('respects the context width it is given', () => {
    const narrow = collapseUnchanged(long(15), 1).filter((l) => l !== null)
    const wide = collapseUnchanged(long(15), 6).filter((l) => l !== null)
    expect(wide.length).toBeGreaterThan(narrow.length)
  })
})
