import { useEffect, useCallback, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  usePrompt,
  useCreatePrompt,
  useUpdatePrompt,
} from '../api/prompts.ts'
import { useTags } from '../api/tags.ts'
import { useConstraints } from '../api/constraints.ts'
import { verifyContent } from '../api/verify.ts'
import { useFileTree, useSaveFile, useFileContent } from '../api/files.ts'
import { useGitStatus, useGitCommit } from '../api/projects.ts'
import { useEditorStore } from '../store/editor.ts'
import { useProjectStore } from '../store/project.ts'
import XmlEditor from '../components/XmlEditor.tsx'
import VerificationPanel from '../components/VerificationPanel.tsx'
import PromptPreview from '../components/PromptPreview.tsx'
import EditorToolbar from '../components/EditorToolbar.tsx'
import EditorSidebar from '../components/EditorSidebar.tsx'
import { GitStatusList, CommitDialog } from '../components/GitPanel.tsx'
import type { Project } from '../api/projects.ts'

export default function PromptEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isLegacyMode = !!id

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
  const runVerification = useCallback(
    (xmlContent: string) => {
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current)
      }
      if (!xmlContent.trim()) {
        setVerification(null)
        return
      }
      verifyTimerRef.current = setTimeout(async () => {
        setIsVerifying(true)
        try {
          const varRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g
          const detectedVars: Record<string, { description: string }> = {}
          let m
          while ((m = varRegex.exec(xmlContent)) !== null) {
            detectedVars[m[1]] = { description: 'Template variable' }
          }
          const result = await verifyContent({ content: xmlContent, variables: detectedVars })
          setVerification(result)
        } catch {
          // Verification failures are non-fatal
        } finally {
          setIsVerifying(false)
        }
      }, 500)
    },
    [setVerification, setIsVerifying],
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
        await saveFile.mutateAsync({
          filePath: currentFilePath,
          content,
        })
        resetDirty()
      } else {
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
      setCurrentFile(filePath)
    },
    [setCurrentFile],
  )

  const handleNewFile = useCallback(
    (fileName: string) => {
      setCurrentFile(fileName)
      setContent('')
      setName(fileName.replace('.xml', ''))
      setDescription(fileName)
    },
    [setCurrentFile, setContent, setName, setDescription],
  )

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

  const handleCommit = useCallback(async (message: string) => {
    await gitCommit.mutateAsync({ message })
  }, [gitCommit])

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
      <EditorToolbar
        name={name}
        onNameChange={setName}
        currentFilePath={currentFilePath}
        isDirty={isDirty}
        isSaving={isSaving}
        verification={verification}
        promptVersion={prompt?.version}
        currentProjectId={currentProjectId}
        hasGitChanges={hasGitChanges}
        gitChangeCount={gitStatus.length}
        onCommitClick={() => setShowCommitDialog(true)}
        onSave={handleSave}
        saveDisabled={isSaving || !content.trim() || (!currentFilePath && !name.trim())}
      />

      {/* Three-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        <EditorSidebar
          currentProjectId={currentProjectId}
          currentProjectPath={currentProjectPath}
          currentFilePath={currentFilePath}
          files={files}
          tags={tags}
          constraints={constraints}
          isDirty={isDirty}
          onSelectProject={handleSelectProject}
          onSelectFile={handleSelectFile}
          onNewFile={handleNewFile}
          onInsertConstraint={handleInsertConstraint}
          onSelectTemplate={handleSelectTemplate}
        />

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

        {/* Right panel: Preview + Verification + Git */}
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
              content={content}
              onApplyFix={handleContentChange}
            />
          </div>

          {currentProjectId && (
            <GitStatusList gitStatus={gitStatus} />
          )}
        </aside>
      </div>

      {showCommitDialog && (
        <CommitDialog
          gitStatus={gitStatus}
          onCommit={handleCommit}
          isCommitting={gitCommit.isPending}
          onClose={() => setShowCommitDialog(false)}
        />
      )}
    </div>
  )
}
