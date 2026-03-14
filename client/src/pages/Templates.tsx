import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  type Template,
} from '../api/files.ts'

export default function Templates() {
  const { data, isLoading } = useTemplates()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const deleteTemplate = useDeleteTemplate()

  const templates = data?.templates ?? []

  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState('general')
  const [error, setError] = useState('')

  const filtered = templates.filter(
    (t) =>
      t.name.includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()),
  )

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormContent('')
    setFormCategory('general')
    setError('')
  }

  const startCreate = () => {
    resetForm()
    setEditing(null)
    setCreating(true)
  }

  const startEdit = (t: Template) => {
    setFormName(t.name)
    setFormDescription(t.description)
    setFormContent(t.content)
    setFormCategory(t.category)
    setError('')
    setCreating(false)
    setEditing(t)
  }

  const cancelForm = () => {
    setCreating(false)
    setEditing(null)
    resetForm()
  }

  const handleSave = async () => {
    setError('')
    try {
      if (creating) {
        if (!formName.trim() || !formDescription.trim() || !formContent.trim()) {
          setError('Name, description, and content are required')
          return
        }
        await createTemplate.mutateAsync({
          name: formName.trim(),
          description: formDescription.trim(),
          content: formContent,
          category: formCategory,
        })
      } else if (editing) {
        await updateTemplate.mutateAsync({
          name: editing.name,
          description: formDescription.trim() || undefined,
          content: formContent || undefined,
          category: formCategory || undefined,
        })
      }
      cancelForm()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete template "${name}"?`)) return
    await deleteTemplate.mutateAsync(name)
    if (editing?.name === name) cancelForm()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 dark:text-gray-400 dark:bg-gray-950">
        Loading templates...
      </div>
    )
  }

  const isFormOpen = creating || editing !== null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/prompts/new"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              &larr; Back to Editor
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Template Library
            </h1>
            <span className="text-sm text-gray-400 dark:text-gray-500">
              {templates.length} templates
            </span>
          </div>
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            + New Template
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Left: List */}
        <div className={`${isFormOpen ? 'w-1/3' : 'w-full max-w-4xl mx-auto'} p-6`}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
          />

          <div className="space-y-2">
            {filtered.map((t) => (
              <div
                key={t.name}
                className={`bg-white dark:bg-gray-900 rounded-lg border p-4 cursor-pointer ${
                  editing?.name === t.name
                    ? 'border-blue-500 ring-1 ring-blue-500'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => startEdit(t)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                      {t.name.replace(/-/g, ' ')}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {t.category}
                    </span>
                    {t.is_builtin && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        built-in
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(t.name)
                    }}
                    className="text-xs text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    title="Delete template"
                  >
                    Delete
                  </button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t.description}
                </p>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 dark:text-gray-500 py-8">
                {search ? 'No templates match your search' : 'No templates yet'}
              </p>
            )}
          </div>
        </div>

        {/* Right: Edit/Create form */}
        {isFormOpen && (
          <div className="w-2/3 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {creating ? 'New Template' : `Edit: ${editing?.name}`}
              </h2>
              <button
                onClick={cancelForm}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {creating && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="my-template (lowercase, hyphens)"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What this template is for..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="general, content, data, safety, ..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Content
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="<task>...</task>"
                  rows={16}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={
                    createTemplate.isPending || updateTemplate.isPending
                  }
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {createTemplate.isPending || updateTemplate.isPending
                    ? 'Saving...'
                    : creating
                      ? 'Create Template'
                      : 'Save Changes'}
                </button>
                <button
                  onClick={cancelForm}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
