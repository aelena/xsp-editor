import { useState } from 'react'
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
  type Project,
} from '../api/projects.ts'
import { apiFetch } from '../api/client.ts'

interface ProjectSelectorProps {
  currentProjectId: string | null
  onSelectProject: (project: Project | null) => void
}

export default function ProjectSelector({
  currentProjectId,
  onSelectProject,
}: ProjectSelectorProps) {
  const { data } = useProjects()
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPath, setNewPath] = useState('')
  const [error, setError] = useState('')
  const [browsing, setBrowsing] = useState(false)

  const projects = data?.projects ?? []

  const handleBrowse = async () => {
    setBrowsing(true)
    try {
      const result = await apiFetch<{ path: string | null; cancelled?: boolean }>(
        '/browse-folder',
        { method: 'POST' },
      )
      if (result.path) {
        setNewPath(result.path)
        if (!newName.trim()) {
          // Auto-fill name from last folder segment
          const segments = result.path.replace(/\\/g, '/').split('/')
          const last = segments.filter(Boolean).pop() || ''
          setNewName(last)
        }
      }
    } catch {
      // Fallback: just let the user type manually
    } finally {
      setBrowsing(false)
    }
  }

  const handleAdd = async () => {
    if (!newName.trim() || !newPath.trim()) return
    setError('')
    try {
      const project = await createProject.mutateAsync({
        name: newName.trim(),
        path: newPath.trim(),
      })
      onSelectProject(project)
      setShowAdd(false)
      setNewName('')
      setNewPath('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteProject.mutateAsync(id)
    if (currentProjectId === id) {
      onSelectProject(null)
    }
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Project
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-[10px] text-blue-600 hover:text-blue-800"
          >
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showAdd && (
          <div className="mb-2 space-y-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              className="w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            />
            <div className="flex gap-1">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="Directory path"
                className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 min-w-0"
              />
              <button
                type="button"
                onClick={handleBrowse}
                disabled={browsing}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 shrink-0 disabled:opacity-50"
                title="Browse for folder"
              >
                {browsing ? '...' : 'Browse'}
              </button>
            </div>
            {error && <p className="text-[10px] text-red-500">{error}</p>}
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newPath.trim()}
              className="w-full text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Add Project
            </button>
          </div>
        )}

        {projects.length === 0 && !showAdd ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-1">No projects yet</p>
        ) : (
          <div className="space-y-0.5">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => onSelectProject(p)}
                className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs ${
                  currentProjectId === p.id
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0">
                    {p.is_git_repo ? (
                      <span title="Git repo" className="text-orange-500">&#9679;</span>
                    ) : (
                      <span title="No git" className="text-gray-300 dark:text-gray-600">&#9675;</span>
                    )}
                  </span>
                  <span className="truncate font-medium">{p.name}</span>
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  className="text-gray-300 dark:text-gray-600 hover:text-red-500 shrink-0 ml-1"
                  title="Remove project"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
