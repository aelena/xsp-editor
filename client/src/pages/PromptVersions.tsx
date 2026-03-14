import { Link, useParams } from 'react-router-dom'
import { usePrompt, usePromptVersions } from '../api/prompts.ts'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PromptVersions() {
  const { id } = useParams<{ id: string }>()
  const { data: promptData, isLoading: promptLoading, isError: promptError } = usePrompt(id)
  const {
    data: versionsData,
    isLoading: versionsLoading,
    isError: versionsError,
  } = usePromptVersions(id)

  const versions = versionsData?.versions ?? []
  const hasVersions = versions.length > 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            to="/prompts"
            className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ← Back to Prompts
          </Link>
        </div>

        {promptLoading || versionsLoading ? (
          <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
            Loading changelog...
          </div>
        ) : promptError || versionsError ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            Failed to load: {promptError ? 'Prompt not found' : 'Could not load versions'}
          </div>
        ) : !hasVersions ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center shadow-sm dark:shadow-gray-900/50">
            <p className="text-base text-gray-600 dark:text-gray-300">
              There is no changelog for this template.
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Changelog entries are created when you save changes to the prompt.
            </p>
            <Link
              to="/prompts"
              className="mt-6 inline-flex items-center rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
            >
              ← Back to Prompts
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Changelog: {promptData?.name ?? id}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Version history for this XSP template
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-900/50">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase"
                    >
                      Version
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase"
                    >
                      Author
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase"
                    >
                      Summary
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {versions.map((v) => (
                    <tr
                      key={v.version}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          v{v.version}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(v.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {v.author}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {v.changelog_summary || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
