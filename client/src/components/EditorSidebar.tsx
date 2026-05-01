import { useState, useCallback } from 'react'
import FileTree from './FileTree.tsx'
import ProjectSelector from './ProjectSelector.tsx'
import TemplateGallery from './TemplateGallery.tsx'
import ConstraintPicker from './ConstraintPicker.tsx'
import type { Tag } from '../api/tags.ts'
import type { Constraint } from '../api/constraints.ts'
import type { Project } from '../api/projects.ts'

interface FileEntry {
  path: string
  type: 'file' | 'directory'
}

interface EditorSidebarProps {
  currentProjectId: string | null
  currentProjectPath: string | null
  currentFilePath: string | null
  files: FileEntry[]
  tags: Tag[]
  constraints: Constraint[]
  isDirty: boolean
  onSelectProject: (project: Project | null) => void
  onSelectFile: (filePath: string) => void
  onNewFile: (fileName: string) => void
  onInsertConstraint: (xmlBlock: string) => void
  onSelectTemplate: (name: string, content: string) => void
}

export default function EditorSidebar({
  currentProjectId,
  currentProjectPath,
  currentFilePath,
  files,
  tags,
  constraints,
  isDirty,
  onSelectProject,
  onSelectFile,
  onNewFile,
  onInsertConstraint,
  onSelectTemplate,
}: EditorSidebarProps) {
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  const handleNewFile = useCallback(() => {
    if (!newFileName.trim()) return
    const fileName = newFileName.endsWith('.xml')
      ? newFileName
      : `${newFileName}.xml`
    onNewFile(fileName)
    setShowNewFile(false)
    setNewFileName('')
  }, [newFileName, onNewFile])

  const handleSelectFile = useCallback(
    (filePath: string) => {
      if (isDirty) {
        if (!window.confirm('You have unsaved changes. Discard?')) return
      }
      onSelectFile(filePath)
    },
    [isDirty, onSelectFile],
  )

  return (
    <aside className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-y-auto shrink-0 flex flex-col">
      {/* Project selector */}
      <ProjectSelector
        currentProjectId={currentProjectId}
        onSelectProject={onSelectProject}
      />

      {/* File tree */}
      {currentProjectPath && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Files
            </span>
            <button
              onClick={() => setShowNewFile(!showNewFile)}
              className="text-[10px] text-blue-600 hover:text-blue-800"
            >
              + New
            </button>
          </div>
          {showNewFile && (
            <div className="px-3 pb-2 flex gap-1">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="filename.xml"
                className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                onKeyDown={(e) => e.key === 'Enter' && handleNewFile()}
              />
              <button
                onClick={handleNewFile}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded"
              >
                Create
              </button>
            </div>
          )}
          <FileTree
            files={files}
            selectedPath={currentFilePath}
            onSelectFile={handleSelectFile}
          />
        </div>
      )}

      {/* Templates */}
      <div className="border-b border-gray-200 dark:border-gray-700 py-2">
        <TemplateGallery onSelectTemplate={onSelectTemplate} />
      </div>

      {/* Tags */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <h4 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
          Tags
        </h4>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
          Auto-complete in editor when you type {"'<'"}.
        </p>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.name}
              className={`text-[10px] px-1 py-0.5 rounded ${
                tag.enforcement === 'required'
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                  : tag.enforcement === 'recommended'
                    ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                    : tag.enforcement === 'deprecated'
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 line-through'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
              title={tag.purpose}
            >
              {tag.name}
            </span>
          ))}
        </div>
      </div>

      {/* Constraints */}
      <div className="p-3">
        <ConstraintPicker
          constraints={constraints}
          onInsert={onInsertConstraint}
        />
      </div>
    </aside>
  )
}
