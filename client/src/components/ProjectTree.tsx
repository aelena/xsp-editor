import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
  useTree,
  type TreeNode,
} from '../api/membership.ts'

interface Props {
  selectedId?: string
  onSelect?: (projectId: string) => void
}

/**
 * Projects, each expanding to the prompts and templates hanging off it.
 *
 * One level deep, deliberately: there are no sub-projects, so a general tree
 * widget would offer a shape the model does not have.
 *
 * Archive starts collapsed and sits last. It is the least interesting thing in
 * the list until the moment it is the only thing that matters.
 */
export function ProjectTree({ selectedId, onSelect }: Props) {
  const tree = useTree()
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([GENERAL_PROJECT_ID]),
  )

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (tree.isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading projects...</p>
  }
  if (!tree.data) {
    return <p className="text-sm text-red-500">Could not load the project tree.</p>
  }

  const nodes = [...tree.data.tree].sort(byDisplayOrder)

  return (
    <ul className="text-sm space-y-0.5">
      {nodes.map((node) => {
        const isOpen = expanded.has(node.project.id)
        const count = node.prompts.length + node.templates.length

        return (
          <li key={node.project.id}>
            <div
              className={`flex items-center gap-1 rounded px-1 ${
                selectedId === node.project.id ? 'bg-blue-50 dark:bg-gray-700' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(node.project.id)}
                aria-label={isOpen ? `Collapse ${node.project.name}` : `Expand ${node.project.name}`}
                aria-expanded={isOpen}
                className="w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
              >
                {count === 0 ? '·' : isOpen ? '−' : '+'}
              </button>
              <button
                type="button"
                onClick={() => onSelect?.(node.project.id)}
                /* Named explicitly, because the visible text is the name plus a
                   count, and "Alpha 4" is not what this button does. */
                aria-label={node.project.name}
                className="flex-1 text-left truncate py-0.5 dark:text-gray-200"
              >
                {node.project.name}
                <span className="ml-1 text-xs text-gray-400">{count}</span>
              </button>
            </div>

            {isOpen && count > 0 && (
              <ul className="ml-5 border-l border-gray-200 dark:border-gray-700 pl-2 py-0.5 space-y-0.5">
                {node.prompts.map((prompt) => (
                  <li key={prompt.id} className="truncate">
                    <Link
                      to={`/prompts/${prompt.id}/edit`}
                      className="text-xs text-gray-700 dark:text-gray-300 hover:underline"
                    >
                      {prompt.name}
                    </Link>
                    <span className="ml-1 text-xs text-gray-400">{prompt.version}</span>
                  </li>
                ))}
                {node.templates.map((template) => (
                  <li key={template.name} className="truncate">
                    <Link
                      to="/templates"
                      className="text-xs text-gray-500 dark:text-gray-400 hover:underline italic"
                      title={`Template in ${template.category}`}
                    >
                      {template.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** General first, Archive last, everything else alphabetical between them. */
function byDisplayOrder(a: TreeNode, b: TreeNode): number {
  const rank = (id: string) =>
    id === GENERAL_PROJECT_ID ? 0 : id === ARCHIVE_PROJECT_ID ? 2 : 1
  const difference = rank(a.project.id) - rank(b.project.id)
  return difference !== 0 ? difference : a.project.name.localeCompare(b.project.name)
}
