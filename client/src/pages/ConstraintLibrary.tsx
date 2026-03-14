import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useConstraints, useCreateConstraint, useUpdateConstraint, useDeleteConstraint } from '../api/constraints.ts'
import type { Constraint, CreateConstraintRequest, UpdateConstraintRequest } from '../api/constraints.ts'

const SEVERITY_STYLES: Record<Constraint['severity'], string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-gray-100 text-gray-800',
}

const STATUS_STYLES: Record<Constraint['status'], string> = {
  active: 'bg-green-100 text-green-800',
  deprecated: 'bg-orange-100 text-orange-800',
  retired: 'bg-gray-100 text-gray-800',
}

const SEVERITY_OPTIONS: Constraint['severity'][] = ['critical', 'high', 'medium', 'low']
const CATEGORY_OPTIONS: Constraint['category'][] = ['content', 'safety', 'style', 'structural', 'evidence', 'output']
const STATUS_OPTIONS: Constraint['status'][] = ['active', 'deprecated', 'retired']

function SeverityBadge({ severity }: { severity: Constraint['severity'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity]}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }: { status: Constraint['status'] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

interface ConstraintFormData {
  id: string
  description: string
  severity: Constraint['severity']
  category: Constraint['category']
  owner: string
  status: Constraint['status']
  xml_block: string
}

const emptyForm: ConstraintFormData = {
  id: '',
  description: '',
  severity: 'medium',
  category: 'content',
  owner: '',
  status: 'active',
  xml_block: '',
}

function ConstraintFormModal({
  title,
  initial,
  isIdDisabled,
  showStatus,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: {
  title: string
  initial: ConstraintFormData
  isIdDisabled?: boolean
  showStatus?: boolean
  onSubmit: (data: ConstraintFormData) => void
  onCancel: () => void
  isSubmitting: boolean
  error: string | null
}) {
  const [form, setForm] = useState<ConstraintFormData>(initial)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-testid="constraint-form-modal">
      <div className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl dark:shadow-gray-900/50">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>

        {error && (
          <div className="mt-3 rounded-md bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="constraint-id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Constraint ID
            </label>
            <input
              id="constraint-id"
              type="text"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              disabled={isIdDisabled}
              placeholder="e.g. MED-001"
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
            />
          </div>

          <div>
            <label htmlFor="constraint-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <input
              id="constraint-description"
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this constraint enforces"
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="constraint-severity" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Severity
              </label>
              <select
                id="constraint-severity"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as Constraint['severity'] })}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="constraint-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Category
              </label>
              <select
                id="constraint-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Constraint['category'] })}
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="constraint-owner" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Owner
              </label>
              <input
                id="constraint-owner"
                type="text"
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                placeholder="e.g. compliance-team"
                className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            {showStatus && (
              <div>
                <label htmlFor="constraint-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status
                </label>
                <select
                  id="constraint-status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Constraint['status'] })}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="constraint-xml" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              XML Block
            </label>
            <textarea
              id="constraint-xml"
              value={form.xml_block}
              onChange={(e) => setForm({ ...form, xml_block: e.target.value })}
              placeholder={'<constraint id="MED-001" severity="critical">\n  Never provide medical diagnoses.\n</constraint>'}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={isSubmitting || !form.id || !form.description}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ConstraintLibrary() {
  const { data, isLoading, isError, error } = useConstraints()
  const createConstraint = useCreateConstraint()
  const updateConstraint = useUpdateConstraint()
  const deleteConstraint = useDeleteConstraint()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingConstraint, setEditingConstraint] = useState<Constraint | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const constraints = data?.constraints ?? []
  const filteredConstraints = constraints.filter((c) => {
    const matchesSearch = !search ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.owner.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !categoryFilter || c.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  function handleCreate(formData: ConstraintFormData) {
    setFormError(null)
    const request: CreateConstraintRequest = {
      id: formData.id,
      description: formData.description,
      severity: formData.severity,
      category: formData.category,
      owner: formData.owner,
      xml_block: formData.xml_block,
    }
    createConstraint.mutate(request, {
      onSuccess: () => {
        setShowCreateModal(false)
        setFormError(null)
      },
      onError: (err) => {
        setFormError(err instanceof Error ? err.message : 'Failed to create constraint')
      },
    })
  }

  function handleUpdate(formData: ConstraintFormData) {
    setFormError(null)
    const request: UpdateConstraintRequest & { id: string } = {
      id: formData.id,
      description: formData.description,
      severity: formData.severity,
      category: formData.category,
      owner: formData.owner,
      status: formData.status,
      xml_block: formData.xml_block,
    }
    updateConstraint.mutate(request, {
      onSuccess: () => {
        setEditingConstraint(null)
        setFormError(null)
      },
      onError: (err) => {
        setFormError(err instanceof Error ? err.message : 'Failed to update constraint')
      },
    })
  }

  function handleDelete(id: string) {
    deleteConstraint.mutate(id)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Constraint Library</h1>
              <Link to="/prompts" className="text-sm text-blue-600 hover:text-blue-800">
                Back to Prompts
              </Link>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage reusable constraints for XSP prompts
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
              Add Constraint
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            placeholder="Search constraints..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none sm:max-w-md"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6">
          {isLoading && (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400" role="status">
              Loading constraints...
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-300" role="alert">
              Failed to load constraints: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}

          {data && filteredConstraints.length === 0 && (
            <div className="py-12 text-center" data-testid="empty-state">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {search || categoryFilter
                  ? 'No constraints match your filters.'
                  : 'No constraints yet. Add your first constraint to get started.'}
              </p>
            </div>
          )}

          {data && filteredConstraints.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-900/50">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                      ID
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                      Description
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                      Severity
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                      Category
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                      Usage
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 dark:text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredConstraints.map((constraint) => (
                    <tr key={constraint.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-sm font-medium font-mono text-purple-700 ring-1 ring-purple-700/10 ring-inset">
                          {constraint.id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-gray-100">{constraint.description}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{constraint.owner}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <SeverityBadge severity={constraint.severity} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {constraint.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={constraint.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {constraint.usage_count} {constraint.usage_count === 1 ? 'prompt' : 'prompts'}
                      </td>
                      <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setFormError(null)
                              setEditingConstraint(constraint)
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(constraint.id)}
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
        <ConstraintFormModal
          title="Add New Constraint"
          initial={emptyForm}
          onSubmit={handleCreate}
          onCancel={() => {
            setShowCreateModal(false)
            setFormError(null)
          }}
          isSubmitting={createConstraint.isPending}
          error={formError}
        />
      )}

      {editingConstraint && (
        <ConstraintFormModal
          title={`Edit Constraint: ${editingConstraint.id}`}
          initial={{
            id: editingConstraint.id,
            description: editingConstraint.description,
            severity: editingConstraint.severity,
            category: editingConstraint.category,
            owner: editingConstraint.owner,
            status: editingConstraint.status,
            xml_block: editingConstraint.xml_block,
          }}
          isIdDisabled
          showStatus
          onSubmit={handleUpdate}
          onCancel={() => {
            setEditingConstraint(null)
            setFormError(null)
          }}
          isSubmitting={updateConstraint.isPending}
          error={formError}
        />
      )}
    </div>
  )
}
