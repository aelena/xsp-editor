import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle.tsx'
import type { VerificationResult } from '../api/verify.ts'

interface EditorToolbarProps {
  name: string
  onNameChange: (name: string) => void
  currentFilePath: string | null
  isDirty: boolean
  isSaving: boolean
  verification: VerificationResult | null
  promptVersion?: string
  currentProjectId: string | null
  hasGitChanges: boolean
  gitChangeCount: number
  onCommitClick: () => void
  onSave: () => void
  saveDisabled: boolean
}

export default function EditorToolbar({
  name,
  onNameChange,
  currentFilePath,
  isDirty,
  isSaving,
  verification,
  promptVersion,
  currentProjectId,
  hasGitChanges,
  gitChangeCount,
  onCommitClick,
  onSave,
  saveDisabled,
}: EditorToolbarProps) {
  return (
    <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
        <Link
          to="/prompts"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          &larr; Prompts
        </Link>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="prompt-name"
            className="text-lg font-semibold bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 focus:outline-none px-1 py-0.5 dark:text-gray-100"
            data-testid="prompt-name-input"
          />
          {currentFilePath && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
              {currentFilePath}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isDirty && (
          <span className="text-xs text-yellow-600">Unsaved</span>
        )}
        {verification && (
          <span
            title="Verification score from lint checks (see Verification panel on the right)"
            className={`text-xs px-2 py-0.5 rounded cursor-help ${
              verification.status === 'passed'
                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                : verification.status === 'warnings'
                  ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
            }`}
          >
            Lint: {verification.score}/100
          </span>
        )}
        {promptVersion && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded">
            v{promptVersion}
          </span>
        )}
        <Link
          to="/tags"
          className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
        >
          Tags
        </Link>
        <Link
          to="/constraints"
          className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
        >
          Constraints
        </Link>
        <Link
          to="/templates"
          className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
        >
          Templates
        </Link>
        <Link
          to="/playground"
          className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
        >
          Playground
        </Link>
        <Link
          to="/settings"
          className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
        >
          Settings
        </Link>
        {currentProjectId && hasGitChanges && (
          <button
            onClick={onCommitClick}
            className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Commit ({gitChangeCount})
          </button>
        )}
        <ThemeToggle />
        <button
          onClick={onSave}
          disabled={saveDisabled}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="save-button"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </header>
  )
}
