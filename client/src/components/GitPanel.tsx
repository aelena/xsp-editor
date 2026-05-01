import { useState, useCallback } from 'react'

interface GitEntry {
  status: string
  path: string
}

interface GitPanelProps {
  gitStatus: GitEntry[]
  onCommit: (message: string) => Promise<void>
  isCommitting: boolean
}

export function GitStatusList({ gitStatus }: { gitStatus: GitEntry[] }) {
  if (gitStatus.length === 0) return null

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-3">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Git Changes
      </h3>
      <div className="space-y-0.5">
        {gitStatus.map((entry, i) => (
          <div
            key={i}
            className="text-[10px] font-mono flex items-center gap-1"
          >
            <span
              className={`w-4 text-center ${
                entry.status === 'M'
                  ? 'text-yellow-600'
                  : entry.status === '?'
                    ? 'text-green-600'
                    : entry.status === 'D'
                      ? 'text-red-600'
                      : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {entry.status}
            </span>
            <span className="text-gray-600 dark:text-gray-400 truncate">{entry.path}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CommitDialog({
  gitStatus,
  onCommit,
  isCommitting,
  onClose,
}: GitPanelProps & { onClose: () => void }) {
  const [commitMessage, setCommitMessage] = useState('')

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return
    await onCommit(commitMessage)
    setCommitMessage('')
    onClose()
  }, [commitMessage, onCommit, onClose])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl dark:shadow-gray-900/50 w-96 p-5">
        <h3 className="text-sm font-semibold mb-3 dark:text-gray-100">Commit Changes</h3>
        <div className="mb-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {gitStatus.length} file(s) changed
          </div>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isCommitting}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isCommitting ? 'Committing...' : 'Commit'}
          </button>
        </div>
      </div>
    </div>
  )
}
