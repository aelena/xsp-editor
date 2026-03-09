import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '../api/tags.ts'
import type { Tag, CreateTagRequest, UpdateTagRequest } from '../api/tags.ts'

const ENFORCEMENT_STYLES: Record<Tag['enforcement'], string> = {
  required: 'bg-red-100 text-red-800',
  recommended: 'bg-yellow-100 text-yellow-800',
  optional: 'bg-gray-100 text-gray-800',
  deprecated: 'bg-orange-100 text-orange-800',
}

const ENFORCEMENT_OPTIONS: Tag['enforcement'][] = ['required', 'recommended', 'optional', 'deprecated']

function EnforcementBadge({ enforcement }: { enforcement: Tag['enforcement'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ENFORCEMENT_STYLES[enforcement]}`}>
      {enforcement}
    </span>
  )
}

interface TagFormData {
  name: string
  purpose: string
  use_when: string
  example: string
  enforcement: Tag['enforcement']
}

const emptyForm: TagFormData = {
  name: '',
  purpose: '',
  use_when: '',
  example: '',
  enforcement: 'optional',
}

function TagFormModal({
  title,
  initial,
  isNameDisabled,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: {
  title: string
  initial: TagFormData
  isNameDisabled?: boolean
  onSubmit: (data: TagFormData) => void
  onCancel: () => void
  isSubmitting: boolean
  error: string | null
}) {
  const [form, setForm] = useState<TagFormData>(initial)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="tag-form-modal">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="tag-name" className="block text-sm font-medium text-gray-700">
              Tag Name
            </label>
            <input
              id="tag-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={isNameDisabled}
              placeholder="e.g. task"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          <div>
            <label htmlFor="tag-purpose" className="block text-sm font-medium text-gray-700">
              Purpose
            </label>
            <input
              id="tag-purpose"
              type="text"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="What this tag is used for"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="tag-use-when" className="block text-sm font-medium text-gray-700">
              Use When
            </label>
            <input
              id="tag-use-when"
              type="text"
              value={form.use_when}
              onChange={(e) => setForm({ ...form, use_when: e.target.value })}
              placeholder="When to use this tag"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="tag-example" className="block text-sm font-medium text-gray-700">
              Example
            </label>
            <textarea
              id="tag-example"
              value={form.example}
              onChange={(e) => setForm({ ...form, example: e.target.value })}
              placeholder="<task>Summarize the document</task>"
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="tag-enforcement" className="block text-sm font-medium text-gray-700">
              Enforcement
            </label>
            <select
              id="tag-enforcement"
              value={form.enforcement}
              onChange={(e) => setForm({ ...form, enforcement: e.target.value as Tag['enforcement'] })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {ENFORCEMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={isSubmitting || !form.name || !form.purpose}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TagRegistry() {
  const { data, isLoading, isError, error } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const tags = data?.tags ?? []
  const filteredTags = search
    ? tags.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.purpose.toLowerCase().includes(search.toLowerCase()),
      )
    : tags

  function handleCreate(formData: TagFormData) {
    setFormError(null)
    const request: CreateTagRequest = {
      name: formData.name,
      purpose: formData.purpose,
      use_when: formData.use_when,
      example: formData.example,
      enforcement: formData.enforcement,
    }
    createTag.mutate(request, {
      onSuccess: () => {
        setShowCreateModal(false)
        setFormError(null)
      },
      onError: (err) => {
        setFormError(err instanceof Error ? err.message : 'Failed to create tag')
      },
    })
  }

  function handleUpdate(formData: TagFormData) {
    setFormError(null)
    const request: UpdateTagRequest & { name: string } = {
      name: formData.name,
      purpose: formData.purpose,
      use_when: formData.use_when,
      example: formData.example,
      enforcement: formData.enforcement,
    }
    updateTag.mutate(request, {
      onSuccess: () => {
        setEditingTag(null)
        setFormError(null)
      },
      onError: (err) => {
        setFormError(err instanceof Error ? err.message : 'Failed to update tag')
      },
    })
  }

  function handleDelete(name: string) {
    deleteTag.mutate(name)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">Tag Registry</h1>
              <Link to="/prompts" className="text-sm text-blue-600 hover:text-blue-800">
                Back to Prompts
              </Link>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Manage the approved tag vocabulary for XSP prompts
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button
              onClick={() => {
                setFormError(null)
                setShowCreateModal(true)
              }}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Tag
            </button>
          </div>
        </div>

        <div className="mt-6">
          <input
            type="text"
            placeholder="Search tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none sm:max-w-md"
          />
        </div>

        <div className="mt-6">
          {isLoading && (
            <div className="py-12 text-center text-sm text-gray-500" role="status">
              Loading tags...
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              Failed to load tags: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}

          {data && filteredTags.length === 0 && (
            <div className="py-12 text-center" data-testid="empty-state">
              <p className="text-sm text-gray-500">
                {search ? 'No tags match your search.' : 'No tags yet. Add your first tag to get started.'}
              </p>
            </div>
          )}

          {data && filteredTags.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Tag
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Purpose
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Enforcement
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Usage
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Example
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredTags.map((tag) => (
                    <tr key={tag.name} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-sm font-medium font-mono text-blue-700 ring-1 ring-blue-700/10 ring-inset">
                          &lt;{tag.name}&gt;
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{tag.purpose}</div>
                        <div className="mt-1 text-xs text-gray-500">{tag.use_when}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <EnforcementBadge enforcement={tag.enforcement} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {tag.usage_count} {tag.usage_count === 1 ? 'prompt' : 'prompts'}
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-xs text-gray-600 line-clamp-2">{tag.example}</code>
                      </td>
                      <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setFormError(null)
                              setEditingTag(tag)
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(tag.name)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <TagFormModal
          title="Add New Tag"
          initial={emptyForm}
          onSubmit={handleCreate}
          onCancel={() => {
            setShowCreateModal(false)
            setFormError(null)
          }}
          isSubmitting={createTag.isPending}
          error={formError}
        />
      )}

      {editingTag && (
        <TagFormModal
          title={`Edit Tag: ${editingTag.name}`}
          initial={{
            name: editingTag.name,
            purpose: editingTag.purpose,
            use_when: editingTag.use_when,
            example: editingTag.example,
            enforcement: editingTag.enforcement,
          }}
          isNameDisabled
          onSubmit={handleUpdate}
          onCancel={() => {
            setEditingTag(null)
            setFormError(null)
          }}
          isSubmitting={updateTag.isPending}
          error={formError}
        />
      )}
    </div>
  )
}
