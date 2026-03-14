import { useEffect, useCallback, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  usePrompt,
  useCreatePrompt,
  useUpdatePrompt,
} from '../api/prompts.ts'
import { useTags } from '../api/tags.ts'
import { useConstraints } from '../api/constraints.ts'
import {
  verifyContent,
  verifyFix,
  isVerificationFixable,
  type CheckResult,
} from '../api/verify.ts'
import { useFileTree, useSaveFile, useFileContent } from '../api/files.ts'
import { useGitStatus, useGitCommit } from '../api/projects.ts'
import { useEditorStore } from '../store/editor.ts'
import { useProjectStore } from '../store/project.ts'
import XmlEditor from '../components/XmlEditor.tsx'
import VerificationPanel from '../components/VerificationPanel.tsx'
import ConstraintPicker from '../components/ConstraintPicker.tsx'
import PromptPreview from '../components/PromptPreview.tsx'
import FileTree from '../components/FileTree.tsx'
import ProjectSelector from '../components/ProjectSelector.tsx'
import TemplateGallery from '../components/TemplateGallery.tsx'
import ThemeToggle from '../components/ThemeToggle.tsx'
import type { Project } from '../api/projects.ts'

export default function PromptEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isLegacyMode = !!id // Opening a prompt by ID (from prompt list)

  // Project state
  const {
    currentProjectId,
    currentProjectPath,
    currentFilePath,
    setCurrentProject,
    setCurrentFile,
  } = useProjectStore()

  // Editor state
  const {
    content,
    name,
    description,
    isDirty,
    isSaving,
    verification,
    isVerifying,
    setContent,
    setName,
    setDescription,
    setVerification,
    setIsVerifying,
    setIsSaving,
    resetDirty,
    reset,
  } = useEditorStore()

  // Data queries
  const { data: prompt, isLoading: isLoadingPrompt } = usePrompt(
    isLegacyMode ? id : undefined,
  )
  const { data: tagsData } = useTags()
  const { data: constraintsData } = useConstraints()
  const { data: fileTreeData } = useFileTree(currentProjectPath ?? undefined)
  const { data: fileContentData } = useFileContent(
    currentProjectPath ?? undefined,
    !isLegacyMode ? (currentFilePath ?? undefined) : undefined,
  )
  const { data: gitStatusData } = useGitStatus(currentProjectId ?? undefined)

  const createPrompt = useCreatePrompt()
  const updatePrompt = useUpdatePrompt(id ?? '')
  const saveFile = useSaveFile(currentProjectPath ?? '')
  const gitCommit = useGitCommit(currentProjectId ?? '')

  const tags = tagsData?.tags ?? []
  const constraints = constraintsData?.constraints ?? []
  const files = fileTreeData?.files ?? []

  // Commit dialog
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')

  // Verification fix state
  const [fixingRule, setFixingRule] = useState<string | null>(null)
  const [fixError, setFixError] = useState<string | null>(null)

  // New file dialog
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  // Load prompt data when editing an existing prompt (legacy mode)
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (isLegacyMode && prompt && !hasLoadedRef.current) {
      setContent(prompt.content)
      setName(prompt.name)
      setDescription(prompt.description)
      resetDirty()
      hasLoadedRef.current = true
    }
  }, [isLegacyMode, prompt, setContent, setName, setDescription, resetDirty])

  // Load file content when a file is selected (project mode)
  useEffect(() => {
    if (!isLegacyMode && fileContentData) {
      setContent(fileContentData.content)
      const fileName = currentFilePath?.split('/').pop()?.replace('.xml', '') ?? ''
      setName(fileName)
      setDescription(currentFilePath ?? '')
      resetDirty()
    }
  }, [
    isLegacyMode,
    fileContentData,
    currentFilePath,
    setContent,
    setName,
    setDescription,
    resetDirty,
  ])

  // Reset store when component unmounts or when switching
  useEffect(() => {
    hasLoadedRef.current = false
    return () => {
      reset()
    }
  }, [id, currentFilePath, reset])

  // Debounced verification
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function buildDetectedVars(xmlContent: string): Record<string, { description: string }> {
    const varRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g
    const detected: Record<string, { description: string }> = {}
    let m
    while ((m = varRegex.exec(xmlContent)) !== null) {
      detected[m[1]] = { description: 'Template variable' }
    }
    return detected
  }

  const runVerification = useCallback(
    (
      xmlContent: string,
      variablesOverride?: Record<string, { description: string; required?: boolean }>,
      immediate = false,
    ) => {
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current)
        verifyTimerRef.current = null
      }
      if (!xmlContent.trim()) {
        setVerification(null)
        return
      }
      const vars = variablesOverride ?? buildDetectedVars(xmlContent)
      const doVerify = async () => {
        setIsVerifying(true)
        try {
          const result = await verifyContent({
            content: xmlContent,
            variables: vars,
          })
          setVerification(result)
        } catch {
          // Verification failures are non-fatal
        } finally {
          setIsVerifying(false)
        }
      }
      if (immediate) {
        doVerify()
      } else {
        verifyTimerRef.current = setTimeout(doVerify, 500)
      }
    },
    [setVerification, setIsVerifying],
  )

  const handleVerificationFix = useCallback(
    async (check: CheckResult) => {
      if (!content.trim()) return
      setFixingRule(check.rule)
      setFixError(null)
      try {
        const vars = buildDetectedVars(content)
        const result = await verifyFix({
          content,
          rule: check.rule,
          message: check.message,
          variables: vars,
        })
        if (result.content !== undefined) {
          setContent(result.content)
          runVerification(result.content, undefined, true)
        } else if (result.variables !== undefined) {
          runVerification(content, result.variables, true)
        }
      } catch (err) {
        setFixError(err instanceof Error ? err.message : 'Fix failed')
      } finally {
        setFixingRule(null)
      }
    },
    [content, setContent, runVerification],
  )

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent)
      runVerification(newContent)
    },
    [setContent, runVerification],
  )

  const handleInsertConstraint = useCallback(
    (xmlBlock: string) => {
      const newContent = content ? `${content}\n${xmlBlock}` : xmlBlock
      setContent(newContent)
      runVerification(newContent)
    },
    [content, setContent, runVerification],
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      if (currentProjectPath && currentFilePath) {
        // Project mode: save file to disk
        await saveFile.mutateAsync({
          filePath: currentFilePath,
          content,
        })
        resetDirty()
      } else {
        // Prompt API mode (legacy edit or standalone)
        if (!name.trim()) return
        if (!id) {
          const created = await createPrompt.mutateAsync({
            name,
            description,
            content,
          })
          resetDirty()
          navigate(`/prompts/${created.id}/edit`, { replace: true })
        } else {
          await updatePrompt.mutateAsync({
            name,
            description,
            content,
            version_bump: 'patch',
          })
          resetDirty()
        }
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    isLegacyMode,
    id,
    name,
    description,
    content,
    currentProjectPath,
    currentFilePath,
    createPrompt,
    updatePrompt,
    saveFile,
    navigate,
    setIsSaving,
    resetDirty,
  ])

  const handleSelectProject = useCallback(
    (project: Project | null) => {
      if (project) {
        setCurrentProject(project.id, project.path)
      } else {
        setCurrentProject(null, null)
      }
    },
    [setCurrentProject],
  )

  const handleSelectFile = useCallback(
    (filePath: string) => {
      if (isDirty) {
        if (!window.confirm('You have unsaved changes. Discard?')) return
      }
      setCurrentFile(filePath)
    },
    [isDirty, setCurrentFile],
  )

  const handleNewFile = useCallback(() => {
    if (!newFileName.trim()) return
    const fileName = newFileName.endsWith('.xml')
      ? newFileName
      : `${newFileName}.xml`
    setCurrentFile(fileName)
    setContent('')
    setName(newFileName.replace('.xml', ''))
    setDescription(fileName)
    setShowNewFile(false)
    setNewFileName('')
  }, [newFileName, setCurrentFile, setContent, setName, setDescription])

  const handleSelectTemplate = useCallback(
    (templateName: string, templateContent: string) => {
      if (currentProjectPath) {
        const fileName = `${templateName}.xml`
        setCurrentFile(fileName)
        setContent(templateContent)
        setName(templateName)
        setDescription(fileName)
        runVerification(templateContent)
      } else {
        setContent(templateContent)
        setName(templateName)
        runVerification(templateContent)
      }
    },
    [
      currentProjectPath,
      setCurrentFile,
      setContent,
      setName,
      setDescription,
      runVerification,
    ],
  )

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) return
    try {
      await gitCommit.mutateAsync({ message: commitMessage })
      setShowCommitDialog(false)
      setCommitMessage('')
    } catch {
      // Error handled by mutation
    }
  }, [commitMessage, gitCommit])

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  if (isLegacyMode && isLoadingPrompt) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 dark:text-gray-400 dark:bg-gray-950">
        Loading prompt...
      </div>
    )
  }

  const gitStatus = gitStatusData?.status ?? []
  const hasGitChanges = gitStatus.length > 0

  return (
    <div className="h-screen flex flex-col" data-testid="prompt-editor-page">
      {/* Header */}
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
              onChange={(e) => setName(e.target.value)}
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
          {prompt?.version && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded">
              v{prompt.version}
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
              onClick={() => setShowCommitDialog(true)}
              className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Commit ({gitStatus.length})
            </button>
          )}
          <ThemeToggle />
          <button
            onClick={handleSave}
            disabled={isSaving || !content.trim() || (!currentFilePath && !name.trim())}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="save-button"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* Three-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Project tree + Tags + Constraints + Templates */}
        <aside className="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-y-auto shrink-0 flex flex-col">
          {/* Project selector */}
          <ProjectSelector
            currentProjectId={currentProjectId}
            onSelectProject={handleSelectProject}
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
            <TemplateGallery onSelectTemplate={handleSelectTemplate} />
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
              onInsert={handleInsertConstraint}
            />
          </div>
        </aside>

        {/* Center: XML Editor */}
        <main className="flex-1 min-w-0 flex flex-col">
          {!isLegacyMode && !currentFilePath && !content ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">Select a file or create a new one</p>
                <p className="text-sm">
                  Choose a file from the tree, or pick a template to start
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <XmlEditor
                value={content}
                onChange={handleContentChange}
                tags={tags}
                verification={verification}
              />
            </div>
          )}
        </main>

        {/* Right panel: Preview + Verification */}
        <aside className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-y-auto shrink-0 flex flex-col">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide p-3">
              Preview
            </h3>
            <div className="max-h-64 overflow-y-auto">
              <PromptPreview content={content} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide p-3">
              Verification
            </h3>
            <VerificationPanel
              result={verification}
              isVerifying={isVerifying}
              onFix={handleVerificationFix}
              fixingRule={fixingRule}
              fixError={fixError}
              onDismissFixError={() => setFixError(null)}
            />
          </div>

          {/* Git status */}
          {currentProjectId && gitStatus.length > 0 && (
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
          )}
        </aside>
      </div>

      {/* Commit dialog */}
      {showCommitDialog && (
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
                onClick={() => setShowCommitDialog(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim() || gitCommit.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {gitCommit.isPending ? 'Committing...' : 'Commit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
