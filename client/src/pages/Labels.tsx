import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useDeleteLabel,
  useLabelArtifacts,
  useLabelUsage,
  useRenameLabel,
} from '../api/labels.ts'

/**
 * Every label in use, and the two operations that keep the set from rotting.
 *
 * Free-form labelling always drifts: "draft", "Draft", "drafts", each typed by
 * someone who could not see the other two. Without a screen that shows the whole
 * set with counts, and lets you merge and remove across every artifact at once,
 * the feature is a mess generator. This is the other half of it.
 */
export function Labels() {
  const usage = useLabelUsage()
  const rename = useRenameLabel()
  const remove = useDeleteLabel()

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const artifacts = useLabelArtifacts(selected)
  const labels = usage.data?.labels ?? []

  const startRename = (label: string) => {
    setRenaming(label)
    setNewName(label)
    setConfirming(null)
    setError('')
  }

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault()
    if (!renaming || !newName.trim()) return
    setError('')

    const merging = labels.some(
      (l) => l.label.toLowerCase() === newName.trim().toLowerCase() &&
        l.label.toLowerCase() !== renaming.toLowerCase(),
    )

    rename.mutate(
      { label: renaming, to: newName.trim() },
      {
        onSuccess: (result) => {
          setNote(
            merging
              ? `Merged into ${result.label}, across ${result.affected} item${result.affected === 1 ? '' : 's'}.`
              : `Renamed on ${result.affected} item${result.affected === 1 ? '' : 's'}.`,
          )
          setRenaming(null)
          if (selected === renaming) setSelected(result.label)
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not rename the label'),
      },
    )
  }

  const confirmDelete = (label: string) => {
    setError('')
    remove.mutate(label, {
      onSuccess: (result) => {
        setNote(`Removed from ${result.affected} item${result.affected === 1 ? '' : 's'}.`)
        setConfirming(null)
        if (selected === label) setSelected(undefined)
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : 'Could not remove the label'),
    })
  }

  return (
    <div className="p-4">
      <header className="mb-4">
        <h1 className="text-lg font-semibold dark:text-gray-100">Labels</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-prose">
          Free text you put on prompts and templates. Separate from the{' '}
          <Link to="/tags" className="underline">
            tag registry
          </Link>
          , which is the vocabulary of XML elements that verification checks against.
        </p>
      </header>

      {note && <p className="text-sm text-green-700 dark:text-green-400 mb-3">{note}</p>}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {usage.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading labels...</p>
      ) : labels.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No labels yet. Add one from any prompt or template.
        </p>
      ) : (
        <div className="flex gap-6">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                <th className="py-1 pr-6">Label</th>
                <th className="py-1 pr-6 text-right">Items</th>
                <th className="py-1 pr-6 text-right">Prompts</th>
                <th className="py-1 pr-6 text-right">Templates</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {labels.map((entry) => (
                <tr
                  key={entry.label}
                  className="border-t border-gray-200 dark:border-gray-700"
                >
                  <td className="py-1.5 pr-6">
                    <button
                      type="button"
                      onClick={() => setSelected(entry.label)}
                      className="dark:text-gray-200 hover:underline"
                    >
                      {entry.label}
                    </button>
                  </td>
                  <td className="py-1.5 pr-6 text-right tabular-nums dark:text-gray-300">
                    {entry.count}
                  </td>
                  <td className="py-1.5 pr-6 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {entry.prompts}
                  </td>
                  <td className="py-1.5 pr-6 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {entry.templates}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startRename(entry.label)}
                      aria-label={`Rename ${entry.label}`}
                      className="text-xs underline text-gray-500 dark:text-gray-400 mr-3"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(entry.label)
                        setRenaming(null)
                      }}
                      aria-label={`Remove ${entry.label}`}
                      className="text-xs underline text-red-600 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <aside className="min-w-56">
            {renaming && (
              <form onSubmit={submitRename} className="space-y-2 mb-4">
                <label className="block text-xs text-gray-600 dark:text-gray-400">
                  Rename {renaming} to
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    className="mt-1 w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
                {/* Merging is a feature, not a collision, but it should not be a
                    surprise: renaming onto an existing label folds the two. */}
                {labels.some(
                  (l) =>
                    l.label.toLowerCase() === newName.trim().toLowerCase() &&
                    l.label.toLowerCase() !== renaming.toLowerCase(),
                ) && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    That label already exists. The two will be merged.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!newName.trim() || rename.isPending}
                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming(null)}
                    className="text-xs px-2 py-1 underline text-gray-500 dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {confirming && (
              <div className="border border-amber-400 dark:border-amber-600 rounded p-3 mb-4 space-y-2">
                <p className="text-sm dark:text-gray-200">
                  Remove <strong>{confirming}</strong> from{' '}
                  {labels.find((l) => l.label === confirming)?.count ?? 0} item(s)?
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The items themselves are not touched.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirmDelete(confirming)}
                    className="text-xs px-2 py-1 rounded bg-red-600 text-white"
                  >
                    Remove it
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-xs px-2 py-1 underline text-gray-500 dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {selected && (
              <div>
                <h2 className="text-sm font-medium dark:text-gray-200 mb-1">
                  Carrying {selected}
                </h2>
                {artifacts.isLoading ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Loading...</p>
                ) : (
                  <ul className="text-xs space-y-0.5">
                    {(artifacts.data?.artifacts ?? []).map((a) => (
                      <li key={`${a.kind} ${a.key}`} className="dark:text-gray-300">
                        {a.kind === 'prompt' ? (
                          <Link to={`/prompts/${a.key}/edit`} className="hover:underline">
                            {a.key}
                          </Link>
                        ) : (
                          <Link to="/templates" className="hover:underline italic">
                            {a.key}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
