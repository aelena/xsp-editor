import { useState } from 'react'
import { ApiError } from '../api/client.ts'
import { useProjects } from '../api/projects.ts'
import {
  ARCHIVE_PROJECT_ID,
  useAddToProject,
  useArchive,
  useMembership,
  useRemoveFromProject,
  useUnarchive,
  type ArtifactKind,
  type OrphanChoice,
} from '../api/membership.ts'

interface Props {
  kind: ArtifactKind
  /** A UUID for a prompt, a name for a template. */
  artifactKey: string
  /** Built-in templates cannot be moved, so the controls are hidden for them. */
  readOnly?: boolean
}

/**
 * Which projects an artifact belongs to, as removable labels, plus the controls
 * for changing that.
 *
 * Archive renders as a state rather than another label, because it is one: an
 * archived artifact is in Archive and nowhere else, so offering to remove it
 * from Archive alongside a list of projects it is not in would misdescribe the
 * model.
 */
export function ProjectLabels({ kind, artifactKey, readOnly = false }: Props) {
  const membership = useMembership(kind, artifactKey)
  const projects = useProjects()
  const addTo = useAddToProject(kind, artifactKey)
  const removeFrom = useRemoveFromProject(kind, artifactKey)
  const archive = useArchive(kind, artifactKey)
  const unarchive = useUnarchive(kind, artifactKey)

  const [adding, setAdding] = useState(false)
  /** The project whose removal is waiting on an archive-or-General answer. */
  const [orphaning, setOrphaning] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState('')

  if (membership.isLoading) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">Loading projects...</p>
  }
  if (!membership.data) {
    return (
      <p className="text-xs text-red-500">Could not load the projects for this {kind === 'prompts' ? 'prompt' : 'template'}.</p>
    )
  }

  const current = membership.data.projects
  const available = (projects.data?.projects ?? []).filter(
    (p) => p.id !== ARCHIVE_PROJECT_ID && !current.some((c) => c.id === p.id),
  )

  const remove = (id: string, name: string, orphans?: OrphanChoice) => {
    setError('')
    removeFrom.mutate(
      { projectId: id, orphans },
      {
        onSuccess: () => setOrphaning(null),
        onError: (err) => {
          // 409 with this marker is not a failure, it is the server declining to
          // choose between archiving and General on the user's behalf.
          if (err instanceof ApiError && err.body.requires === 'archive_or_general') {
            setOrphaning({ id, name })
            return
          }
          setError(err instanceof Error ? err.message : 'Could not change projects')
        },
      },
    )
  }

  if (membership.data.archived) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs px-2 py-0.5 rounded border border-amber-400 text-amber-700 dark:text-amber-300 dark:border-amber-600"
          title="Retired from production and kept for traceability"
        >
          Archived
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => unarchive.mutate()}
            disabled={unarchive.isPending}
            className="text-xs underline text-gray-600 dark:text-gray-300 disabled:opacity-50"
          >
            {unarchive.isPending ? 'Restoring...' : 'Restore to General'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {current.map((project) => (
          <span
            key={project.id}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 dark:text-gray-200"
          >
            {project.name}
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(project.id, project.name)}
                className="text-gray-400 hover:text-red-500"
                title={`Remove from ${project.name}`}
                aria-label={`Remove from ${project.name}`}
              >
                &times;
              </button>
            )}
          </span>
        ))}

        {!readOnly && !adding && available.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs px-2 py-0.5 rounded border border-dashed border-gray-400 dark:border-gray-600 dark:text-gray-300"
          >
            + Project
          </button>
        )}

        {!readOnly && adding && (
          <select
            autoFocus
            defaultValue=""
            aria-label="Add to project"
            onChange={(event) => {
              if (event.target.value) addTo.mutate(event.target.value)
              setAdding(false)
            }}
            onBlur={() => setAdding(false)}
            className="text-xs px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">Choose a project</option>
            {available.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}

        {!readOnly && (
          <button
            type="button"
            onClick={() => archive.mutate()}
            disabled={archive.isPending}
            className="text-xs underline text-gray-500 dark:text-gray-400 ml-1 disabled:opacity-50"
            title="Retire from production, keeping it for traceability"
          >
            Archive
          </button>
        )}
      </div>

      {orphaning && (
        /* Two named outcomes rather than a yes/no, because "Are you sure?" hides
           which of the two happens. */
        <div className="text-xs border border-amber-400 dark:border-amber-600 rounded p-2 space-y-1">
          <p className="dark:text-gray-200">
            {orphaning.name} is the only project this belongs to. Archive it, or leave it in
            General?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => remove(orphaning.id, orphaning.name, 'archive')}
              className="px-2 py-0.5 rounded bg-amber-600 text-white"
            >
              Archive it
            </button>
            <button
              type="button"
              onClick={() => remove(orphaning.id, orphaning.name, 'general')}
              className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 dark:text-gray-200"
            >
              Move to General
            </button>
            <button
              type="button"
              onClick={() => setOrphaning(null)}
              className="px-2 py-0.5 underline text-gray-500 dark:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
