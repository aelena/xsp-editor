import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { ProjectTree } from '../components/ProjectTree.tsx'
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
  useDeleteProjectWithOrphans,
  useOrphanCount,
  useTree,
  type OrphanChoice,
} from '../api/membership.ts'
import { useCreateProject } from '../api/projects.ts'

/**
 * Projects on the left, the contents of the selected one on the right.
 *
 * The tree and this page show the same data at two levels of detail on purpose:
 * the tree answers "where does this live", the panel answers "what is in here".
 */
export function Projects() {
  const tree = useTree()
  const [selectedId, setSelectedId] = useState<string | undefined>(GENERAL_PROJECT_ID)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  const createProject = useCreateProject()
  const deleteProject = useDeleteProjectWithOrphans()
  const orphans = useOrphanCount(confirming ? selectedId : undefined)

  const selected = tree.data?.tree.find((node) => node.project.id === selectedId)
  const isReserved =
    selectedId === GENERAL_PROJECT_ID || selectedId === ARCHIVE_PROJECT_ID

  const create = (event: React.FormEvent) => {
    event.preventDefault()
    if (!newName.trim()) return
    setError('')
    // No path: a project here is a grouping. Pointing one at a folder is done
    // from the project selector, where browsing for it makes sense.
    createProject.mutate(
      { name: newName.trim() },
      {
        onSuccess: () => setNewName(''),
        onError: (err) =>
          setError(err instanceof Error ? err.message : 'Could not create the project'),
      },
    )
  }

  const remove = (choice?: OrphanChoice) => {
    if (!selectedId) return
    setError('')
    deleteProject.mutate(
      { id: selectedId, orphans: choice },
      {
        onSuccess: () => {
          setConfirming(false)
          setSelectedId(GENERAL_PROJECT_ID)
        },
        onError: (err) => {
          if (err instanceof ApiError && typeof err.body.orphan_count === 'number') {
            setConfirming(true)
            return
          }
          setError(err instanceof Error ? err.message : 'Could not delete the project')
        },
      },
    )
  }

  return (
    <div className="flex gap-6 p-4">
      <aside className="w-64 shrink-0 space-y-3">
        <h1 className="text-lg font-semibold dark:text-gray-100">Projects</h1>

        <ProjectTree selectedId={selectedId} onSelect={setSelectedId} />

        <form onSubmit={create} className="flex gap-1 pt-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New project"
            aria-label="New project name"
            className="flex-1 min-w-0 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200"
          />
          <button
            type="submit"
            disabled={!newName.trim() || createProject.isPending}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            Add
          </button>
        </form>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </aside>

      <section className="flex-1 min-w-0">
        {!selected ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choose a project on the left.
          </p>
        ) : (
          <div className="space-y-4">
            <header className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold dark:text-gray-100">
                  {selected.project.name}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  {selected.project.path ?? 'No folder on disk'}
                </p>
              </div>
              {!isReserved && (
                <button
                  type="button"
                  onClick={() => remove()}
                  className="text-xs underline text-red-600 dark:text-red-400"
                >
                  Delete project
                </button>
              )}
            </header>

            {confirming && (
              /* The count makes the choice concrete, and tells the user when the
                 answer does not matter because the number is zero. */
              <div className="text-sm border border-amber-400 dark:border-amber-600 rounded p-3 space-y-2">
                <p className="dark:text-gray-200">
                  Deleting {selected.project.name} leaves{' '}
                  <strong>{orphans.data?.orphan_count ?? '…'}</strong> of its{' '}
                  {orphans.data?.member_count ?? '…'} items with no project. What should
                  happen to those?
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Items that also belong to another project are not affected either way.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => remove('archive')}
                    className="text-xs px-2 py-1 rounded bg-amber-600 text-white"
                  >
                    Archive them
                  </button>
                  <button
                    type="button"
                    onClick={() => remove('general')}
                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 dark:text-gray-200"
                  >
                    Move them to General
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="text-xs px-2 py-1 underline text-gray-500 dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium mb-1 dark:text-gray-200">
                Prompts <span className="text-gray-400">{selected.prompts.length}</span>
              </h3>
              {selected.prompts.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">None yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {selected.prompts.map((prompt) => (
                    <li key={prompt.id} className="text-sm">
                      <Link
                        to={`/prompts/${prompt.id}/edit`}
                        className="hover:underline dark:text-gray-200"
                      >
                        {prompt.name}
                      </Link>
                      <span className="ml-2 text-xs text-gray-400">{prompt.version}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium mb-1 dark:text-gray-200">
                Templates <span className="text-gray-400">{selected.templates.length}</span>
              </h3>
              {selected.templates.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">None yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {selected.templates.map((template) => (
                    <li key={template.name} className="text-sm dark:text-gray-200">
                      {template.name}
                      {template.is_builtin && (
                        <span className="ml-2 text-xs text-gray-400">built-in</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
