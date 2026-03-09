import { useState } from 'react'
import { usePrompts } from '../api/prompts.ts'
import type { Prompt } from '../api/prompts.ts'

const STATUS_STYLES: Record<
  Prompt['verification_status'],
  { bg: string; text: string; label: string }
> = {
  passed: { bg: 'bg-green-100 text-green-800', text: 'text-green-600', label: 'Verified' },
  warnings: { bg: 'bg-yellow-100 text-yellow-800', text: 'text-yellow-600', label: 'Warnings' },
  failed: { bg: 'bg-red-100 text-red-800', text: 'text-red-600', label: 'Errors' },
  unchecked: { bg: 'bg-gray-100 text-gray-800', text: 'text-gray-600', label: 'Unchecked' },
}

function StatusBadge({ status }: { status: Prompt['verification_status'] }) {
  const style = STATUS_STYLES[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg}`}>
      {style.label}
    </span>
  )
}

function VersionBadge({ version }: { version: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-700/10 ring-inset">
      v{version}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function PromptList() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 20

  const { data, isLoading, isError, error } = usePrompts({
    page,
    limit,
    search: search || undefined,
  })

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Prompts</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your XSP prompt templates
            </p>
          </div>
        </div>

        <div className="mt-6">
          <input
            type="text"
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none sm:max-w-md"
          />
        </div>

        <div className="mt-6">
          {isLoading && (
            <div className="py-12 text-center text-sm text-gray-500" role="status">
              Loading prompts...
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              Failed to load prompts: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}

          {data && data.prompts.length === 0 && (
            <div className="py-12 text-center" data-testid="empty-state">
              <p className="text-sm text-gray-500">
                {search ? 'No prompts match your search.' : 'No prompts yet. Create your first prompt to get started.'}
              </p>
            </div>
          )}

          {data && data.prompts.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Version
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Author
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Last Modified
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.prompts.map((prompt) => (
                    <tr key={prompt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {prompt.name}
                        </div>
                        <div className="mt-1 text-sm text-gray-500 line-clamp-1">
                          {prompt.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <VersionBadge version={prompt.version} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={prompt.verification_status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {prompt.author}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(prompt.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Page {data.page} of {totalPages} ({data.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
