import { useState } from 'react'
import {
  useLabelUsage,
  useLabels,
  useSetLabels,
  type ArtifactKind,
} from '../api/labels.ts'

interface Props {
  kind: ArtifactKind
  artifactKey: string
}

/**
 * The labels on one artifact: chips, an input, and suggestions from what is
 * already in use.
 *
 * The suggestions are the part that matters. Free-form labelling drifts into
 * "draft", "Draft" and "drafts" because nobody can see what already exists at
 * the moment they are typing. Offering the existing ones as you type is cheaper
 * than any amount of cleaning up afterwards.
 */
export function LabelEditor({ kind, artifactKey }: Props) {
  const current = useLabels(kind, artifactKey)
  const usage = useLabelUsage()
  const save = useSetLabels(kind, artifactKey)

  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const labels = current.data?.labels ?? []

  const commit = (next: string[]) => {
    setError('')
    save.mutate(next, {
      onError: (err) =>
        setError(err instanceof Error ? err.message : 'Could not save the labels'),
    })
  }

  const add = (raw: string) => {
    const value = raw.trim().replace(/\s+/g, ' ')
    if (!value) return
    // Compared case-insensitively, the same way the server deduplicates, so the
    // chip does not appear to be added and then silently vanish on reload.
    if (labels.some((l) => l.toLowerCase() === value.toLowerCase())) {
      setDraft('')
      return
    }
    commit([...labels, value])
    setDraft('')
  }

  const suggestions = (usage.data?.labels ?? [])
    .map((u) => u.label)
    .filter(
      (label) =>
        !labels.some((l) => l.toLowerCase() === label.toLowerCase()) &&
        (draft.length === 0 || label.toLowerCase().includes(draft.toLowerCase())),
    )
    .slice(0, 6)

  if (current.isLoading) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">Loading labels...</p>
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 dark:text-gray-200"
          >
            {label}
            <button
              type="button"
              onClick={() => commit(labels.filter((l) => l !== label))}
              aria-label={`Remove label ${label}`}
              className="text-gray-400 hover:text-red-500"
            >
              &times;
            </button>
          </span>
        ))}

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter and comma both commit, because people type both and being
            // told which one this field wants is not worth anyone's attention.
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && draft === '' && labels.length > 0) {
              commit(labels.slice(0, -1))
            }
          }}
          onBlur={() => add(draft)}
          placeholder="Add a label"
          aria-label="Add a label"
          className="text-xs px-2 py-0.5 min-w-28 flex-1 bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-500 dark:text-gray-200"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400">In use</span>
          {suggestions.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => add(label)}
              className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
