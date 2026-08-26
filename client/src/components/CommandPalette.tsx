import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hitPath, useSearch, type SearchHit } from '../api/search.ts'

/**
 * Ctrl or Cmd and K: every action and every search result in one list.
 *
 * The reason to build it early rather than late is not convenience. It is that
 * the toolbar had grown a button per feature, and every feature after this one
 * would have added another. A palette is where an action goes when there is no
 * room left for a button, which means there is always room.
 */

interface Command {
  id: string
  label: string
  hint: string
  path: string
}

const COMMANDS: Command[] = [
  { id: 'new-prompt', label: 'New prompt', hint: 'Create', path: '/prompts/new' },
  { id: 'prompts', label: 'Prompts', hint: 'Go to', path: '/prompts' },
  { id: 'projects', label: 'Projects', hint: 'Go to', path: '/projects' },
  { id: 'labels', label: 'Labels', hint: 'Go to', path: '/labels' },
  { id: 'templates', label: 'Templates', hint: 'Go to', path: '/templates' },
  { id: 'tags', label: 'Tag registry', hint: 'Go to', path: '/tags' },
  { id: 'constraints', label: 'Constraints', hint: 'Go to', path: '/constraints' },
  { id: 'playground', label: 'Playground', hint: 'Go to', path: '/playground' },
  { id: 'settings', label: 'Settings, export and import', hint: 'Go to', path: '/settings' },
  { id: 'help', label: 'User manual', hint: 'Go to', path: '/help' },
]

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  prompt: 'Prompt',
  template: 'Template',
  tag: 'Tag',
  constraint: 'Constraint',
  project: 'Project',
  label: 'Label',
}

/** Debounce, so a search does not fire on every keystroke. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const debounced = useDebounced(query, 180)
  const search = useSearch(open ? debounced : '')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
        setQuery('')
        setActive(0)
      } else if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const commands = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return COMMANDS
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(needle))
  }, [query])

  // Memoised, or the fallback empty array is a new reference on every render
  // and the rows below rebuild each time, which is what the linter was pointing
  // at rather than a style preference.
  const hits = useMemo(() => search.data?.hits ?? [], [search.data])

  // Commands first. Someone typing "prompts" almost always wants the page, not
  // the four prompts whose description mentions the word.
  const rows = useMemo(
    () => [
      ...commands.map((c) => ({ kind: 'command' as const, id: c.id, item: c })),
      ...hits.map((h) => ({ kind: 'hit' as const, id: `${h.kind}:${h.key}`, item: h })),
    ],
    [commands, hits],
  )

  // Clamp rather than reset: the selection should survive results arriving
  // without jumping back to the top under someone's fingers.
  const selected = Math.min(active, Math.max(0, rows.length - 1))

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const choose = (index: number) => {
    const row = rows[index]
    if (!row) return
    go(row.kind === 'command' ? row.item.path : hitPath(row.item))
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(selected)
            }
          }}
          placeholder="Search prompts, templates, tags, constraints, or jump to a page"
          aria-label="Search or run a command"
          className="w-full px-4 py-3 text-sm bg-transparent border-b border-gray-200 dark:border-gray-700 focus:outline-none dark:text-gray-100"
        />

        <ul className="max-h-80 overflow-y-auto" role="listbox" aria-label="Results">
          {rows.map((row, index) => (
            <li key={row.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === selected}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`w-full text-left px-4 py-2 flex items-baseline gap-3 ${
                  index === selected ? 'bg-blue-50 dark:bg-gray-800' : ''
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider text-gray-400 w-16 shrink-0">
                  {row.kind === 'command' ? row.item.hint : KIND_LABEL[row.item.kind]}
                </span>
                {/* Narrowed on the row kind rather than reaching for whichever
                    property happens to exist: a command has a label and a hit
                    has a title, and one of the two is always undefined. */}
                <span className="text-sm dark:text-gray-200 truncate">
                  {row.kind === 'command' ? row.item.label : row.item.title}
                </span>
                {row.kind === 'hit' && row.item.context && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {row.item.context}
                  </span>
                )}
              </button>
            </li>
          ))}

          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {search.isFetching ? 'Searching...' : `Nothing matches ${query}`}
            </li>
          )}
        </ul>

        {search.data && search.data.total > hits.length && (
          <p className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            Showing {hits.length} of {search.data.total} matches.
          </p>
        )}
      </div>
    </div>
  )
}
