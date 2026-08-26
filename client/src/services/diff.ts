/**
 * A line diff, computed here rather than fetched or installed.
 *
 * No dependency: the whole algorithm is thirty lines, and a diff library would
 * bring a bundle cost and an API surface for something this contained. Not
 * server-side either, because the client already holds both versions once the
 * changelog is on screen, and asking a server to compare two strings it just
 * sent is a round trip for nothing.
 *
 * Longest common subsequence over lines, which is what git shows and what people
 * expect: unchanged lines anchor the output, so a change reads as a change
 * rather than as everything after it having moved.
 */

export type ChangeKind = 'same' | 'added' | 'removed'

export interface DiffLine {
  kind: ChangeKind
  text: string
  /** 1-based line number in the old text, absent for an addition. */
  oldNumber?: number
  /** 1-based line number in the new text, absent for a removal. */
  newNumber?: number
}

export interface DiffSummary {
  added: number
  removed: number
  /** True when the two texts are identical, which is worth saying out loud. */
  identical: boolean
}

export interface Diff {
  lines: DiffLine[]
  summary: DiffSummary
}

/**
 * Table of longest-common-subsequence lengths for the two line arrays.
 *
 * O(n*m) in time and space. For prompts and templates, which are hundreds of
 * lines at most, that is nothing; a fifty-thousand-line file would be a
 * different conversation and this is capped at 50k characters by the schema.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

export function diffLines(oldText: string, newText: string): Diff {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const table = lcsTable(a, b)

  const lines: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i], oldNumber: i + 1, newNumber: j + 1 })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      // Removal before addition when the two are equally good, so a replaced
      // line reads as the old one struck out and the new one under it, which is
      // the order every diff tool shows and every reader expects.
      lines.push({ kind: 'removed', text: a[i], oldNumber: i + 1 })
      i += 1
    } else {
      lines.push({ kind: 'added', text: b[j], newNumber: j + 1 })
      j += 1
    }
  }

  while (i < a.length) {
    lines.push({ kind: 'removed', text: a[i], oldNumber: i + 1 })
    i += 1
  }
  while (j < b.length) {
    lines.push({ kind: 'added', text: b[j], newNumber: j + 1 })
    j += 1
  }

  const added = lines.filter((l) => l.kind === 'added').length
  const removed = lines.filter((l) => l.kind === 'removed').length

  return { lines, summary: { added, removed, identical: added === 0 && removed === 0 } }
}

/**
 * Collapse long stretches of unchanged lines, keeping a few either side of each
 * change.
 *
 * A version diff on a long prompt is mostly unchanged lines, and a reader
 * scrolling through forty identical ones to find the edit is a reader who stops
 * looking. `null` marks a gap, so the view can draw a divider instead of
 * pretending the lines are adjacent.
 */
export function collapseUnchanged(
  lines: DiffLine[],
  context = 3,
): (DiffLine | null)[] {
  const keep = new Set<number>()

  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (let k = index - context; k <= index + context; k += 1) {
      if (k >= 0 && k < lines.length) keep.add(k)
    }
  })

  const out: (DiffLine | null)[] = []
  let skipping = false

  lines.forEach((line, index) => {
    if (keep.has(index)) {
      out.push(line)
      skipping = false
    } else if (!skipping) {
      // One marker per gap, however long the gap.
      out.push(null)
      skipping = true
    }
  })

  return out
}
