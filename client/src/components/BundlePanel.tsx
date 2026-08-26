import { useRef, useState } from 'react'
import { apiFetch } from '../api/client.ts'
import { getToken } from '../api/auth.ts'

interface ImportPlan {
  dry_run: boolean
  on_conflict: string
  created: number
  updated: number
  skipped: number
  failed: { kind: string; key: string; reason: string }[]
  notes: string[]
}

/**
 * Export and import, which are the backup story and the sharing story at once.
 *
 * The import is two steps on purpose. It writes over somebody's work, and the
 * only honest way to offer that is to say what it will touch before it touches
 * it, so the file is examined with a dry run first and applied second.
 */
export function BundlePanel() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [bundle, setBundle] = useState<unknown>(null)
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [applied, setApplied] = useState<ImportPlan | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  /**
   * Fetch, then hand the browser a blob.
   *
   * Not a plain link to the endpoint: the session token travels in a header and
   * an anchor cannot set one, so a link would download a 401 as a JSON file.
   */
  const download = async () => {
    setError('')
    setBusy('export')
    try {
      const response = await fetch('/api/v1/export', {
        headers: getToken() ? { 'X-API-Key': getToken() as string } : {},
      })
      if (!response.ok) throw new Error(`The server answered ${response.status}`)

      const blob = await response.blob()
      const suggested = /filename="([^"]+)"/.exec(
        response.headers.get('content-disposition') ?? '',
      )?.[1]

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = suggested ?? 'xsp-export.json'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export')
    } finally {
      setBusy('')
    }
  }

  const examine = async (file: File) => {
    setError('')
    setPlan(null)
    setApplied(null)
    setFileName(file.name)
    setBusy('reading')

    try {
      const parsed = JSON.parse(await file.text())
      setBundle(parsed)
      const result = await apiFetch<ImportPlan>(
        `/import?dry_run=true&on_conflict=${overwrite ? 'overwrite' : 'skip'}`,
        { method: 'POST', body: JSON.stringify(parsed) },
      )
      setPlan(result)
    } catch (err) {
      // A file that is not JSON is the commonest mistake here, and "Unexpected
      // token" on its own does not tell anyone which file they picked.
      setError(
        err instanceof SyntaxError
          ? `${file.name} is not valid JSON.`
          : err instanceof Error
            ? err.message
            : 'Could not read that file',
      )
    } finally {
      setBusy('')
    }
  }

  const apply = async () => {
    if (!bundle) return
    setError('')
    setBusy('importing')
    try {
      const result = await apiFetch<ImportPlan>(
        `/import?on_conflict=${overwrite ? 'overwrite' : 'skip'}`,
        { method: 'POST', body: JSON.stringify(bundle) },
      )
      setApplied(result)
      setPlan(null)
      setBundle(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold dark:text-gray-100">Export and import</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-prose">
          One JSON file with every prompt, template, tag, constraint, project, label
          and version. Keep it as a backup, or send it to someone.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={download}
          disabled={busy === 'export'}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {busy === 'export' ? 'Preparing...' : 'Export everything'}
        </button>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
        <label className="block text-sm dark:text-gray-200">
          Import a bundle
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) examine(file)
            }}
            className="mt-1 block text-sm text-gray-600 dark:text-gray-400"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Overwrite anything that already exists
        </label>
        {overwrite && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Records with the same identifier will be replaced by the ones in the file.
          </p>
        )}

        {busy === 'reading' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Reading {fileName}...</p>
        )}

        {plan && (
          <div className="border border-gray-300 dark:border-gray-600 rounded p-3 space-y-2">
            <p className="text-sm dark:text-gray-200">
              <strong>{fileName}</strong> would add{' '}
              <strong className="tabular-nums">{plan.created}</strong>, update{' '}
              <strong className="tabular-nums">{plan.updated}</strong> and skip{' '}
              <strong className="tabular-nums">{plan.skipped}</strong>.
            </p>

            {plan.failed.length > 0 && (
              <div className="text-xs text-red-600 dark:text-red-400">
                <p>{plan.failed.length} record(s) cannot be read and will be left out:</p>
                <ul className="list-disc ml-4">
                  {plan.failed.slice(0, 5).map((f, i) => (
                    <li key={i}>
                      {f.kind} {f.key}: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.notes.map((note) => (
              <p key={note} className="text-xs text-gray-500 dark:text-gray-400">
                {note}
              </p>
            ))}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={apply}
                disabled={busy === 'importing'}
                className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
              >
                {busy === 'importing' ? 'Importing...' : 'Import it'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlan(null)
                  setBundle(null)
                  if (fileInput.current) fileInput.current.value = ''
                }}
                className="text-sm px-3 py-1.5 underline text-gray-500 dark:text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {applied && (
          <p className="text-sm text-green-700 dark:text-green-400">
            Added {applied.created}, updated {applied.updated}, skipped {applied.skipped}.
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </section>
  )
}
