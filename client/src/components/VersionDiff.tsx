import { useMemo, useState } from 'react'
import { collapseUnchanged, diffLines } from '../services/diff.ts'

interface Props {
  /** Label for the left side, usually the older version. */
  fromLabel: string
  fromText: string
  toLabel: string
  toText: string
}

/**
 * What changed between two versions.
 *
 * Rollback existed before this did, which meant the only way to know what you
 * were about to restore was to open both versions and read them side by side.
 */
export function VersionDiff({ fromLabel, fromText, toLabel, toText }: Props) {
  const [showAll, setShowAll] = useState(false)

  const diff = useMemo(() => diffLines(fromText, toText), [fromText, toText])
  const rows = useMemo(
    () => (showAll ? diff.lines : collapseUnchanged(diff.lines, 3)),
    [diff.lines, showAll],
  )

  const hidden = diff.lines.length - rows.filter((r) => r !== null).length

  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-baseline gap-3 mb-2">
        <span className="text-gray-500 dark:text-gray-400">
          {fromLabel} <span aria-hidden="true">&rarr;</span> {toLabel}
        </span>
        {diff.summary.identical ? (
          // Worth saying rather than showing an empty panel, because "no
          // differences" and "failed to load" look the same when both are blank.
          <span className="text-gray-500 dark:text-gray-400">No differences.</span>
        ) : (
          <span className="tabular-nums">
            <span className="text-green-700 dark:text-green-400">+{diff.summary.added}</span>{' '}
            <span className="text-red-700 dark:text-red-400">&minus;{diff.summary.removed}</span>
          </span>
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="underline text-gray-500 dark:text-gray-400"
          >
            Show {hidden} unchanged line{hidden === 1 ? '' : 's'}
          </button>
        )}
        {showAll && diff.lines.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="underline text-gray-500 dark:text-gray-400"
          >
            Collapse
          </button>
        )}
      </div>

      {!diff.summary.identical && (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <table className="min-w-full font-mono">
            <tbody>
              {rows.map((row, index) =>
                row === null ? (
                  <tr key={`gap-${index}`}>
                    <td
                      colSpan={3}
                      className="px-2 py-1 text-center text-gray-400 bg-gray-50 dark:bg-gray-800/60 select-none"
                    >
                      &middot; &middot; &middot;
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`${row.kind}-${index}`}
                    className={
                      row.kind === 'added'
                        ? 'bg-green-50 dark:bg-green-900/20'
                        : row.kind === 'removed'
                          ? 'bg-red-50 dark:bg-red-900/20'
                          : ''
                    }
                  >
                    {/* Two gutters, because a removed line has no number on the
                        new side and an added one has none on the old. */}
                    <td className="px-2 text-right tabular-nums text-gray-400 select-none w-10">
                      {row.oldNumber ?? ''}
                    </td>
                    <td className="px-2 text-right tabular-nums text-gray-400 select-none w-10">
                      {row.newNumber ?? ''}
                    </td>
                    <td className="px-2 py-0.5 whitespace-pre dark:text-gray-200">
                      <span
                        aria-hidden="true"
                        className={
                          row.kind === 'added'
                            ? 'text-green-700 dark:text-green-400'
                            : row.kind === 'removed'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-transparent'
                        }
                      >
                        {row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' '}
                      </span>
                      {/* Colour alone does not say which side a line is on, so
                          the sign carries it for anyone who cannot see the
                          background, and the row says it in words. */}
                      <span className="sr-only">
                        {row.kind === 'added' ? 'Added: ' : row.kind === 'removed' ? 'Removed: ' : ''}
                      </span>
                      {row.text || ' '}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
