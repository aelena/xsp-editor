import { useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  usePrompt,
  useCreatePrompt,
  useUpdatePrompt,
} from '../api/prompts.ts'
import { useTags } from '../api/tags.ts'
import { useConstraints } from '../api/constraints.ts'
import { verifyContent } from '../api/verify.ts'
import { useEditorStore } from '../store/editor.ts'
import XmlEditor from '../components/XmlEditor.tsx'
import VerificationPanel from '../components/VerificationPanel.tsx'
import ConstraintPicker from '../components/ConstraintPicker.tsx'
import PromptPreview from '../components/PromptPreview.tsx'

export default function PromptEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id

  const { data: prompt, isLoading: isLoadingPrompt } = usePrompt(id)
  const { data: tagsData } = useTags()
  const { data: constraintsData } = useConstraints()
  const createPrompt = useCreatePrompt()
  const updatePrompt = useUpdatePrompt(id ?? '')

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

  const tags = tagsData?.tags ?? []
  const constraints = constraintsData?.constraints ?? []

  // Load prompt data when editing an existing prompt
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (prompt && !hasLoadedRef.current) {
      setContent(prompt.content)
      setName(prompt.name)
      setDescription(prompt.description)
      resetDirty()
      hasLoadedRef.current = true
    }
  }, [prompt, setContent, setName, setDescription, resetDirty])

  // Reset store when component unmounts or when switching prompts
  useEffect(() => {
    hasLoadedRef.current = false
    return () => {
      reset()
    }
  }, [id, reset])

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
          const result = await verifyContent({ content: xmlContent })
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
      const newContent = content
        ? `${content}\n${xmlBlock}`
        : xmlBlock
      setContent(newContent)
      runVerification(newContent)
    },
    [content, setContent, runVerification],
  )

  const handleSave = useCallback(async () => {
    if (!name.trim()) return
    setIsSaving(true)
    try {
      if (isNew) {
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
    } finally {
      setIsSaving(false)
    }
  }, [
    isNew,
    name,
    description,
    content,
    createPrompt,
    updatePrompt,
    navigate,
    setIsSaving,
    resetDirty,
  ])

  if (!isNew && isLoadingPrompt) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading prompt...
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col" data-testid="prompt-editor-page">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to="/prompts"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back
          </Link>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prompt-name"
              className="text-lg font-semibold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
              data-testid="prompt-name-input"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description..."
              className="text-sm text-gray-500 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5 w-64"
              data-testid="prompt-description-input"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-xs text-yellow-600">Unsaved changes</span>
          )}
          {prompt?.version && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
              v{prompt.version}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="save-button"
          >
            {isSaving ? 'Saving...' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </header>

      {/* Three-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Constraints sidebar */}
        <aside className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto shrink-0 p-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Sidebar
          </h3>

          {/* Tag info */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-1">
              Tags
            </h4>
            <p className="text-xs text-gray-400 px-2 mb-2">
              Tags auto-complete in the editor when you type {"'<'"}.
            </p>
            <div className="flex flex-wrap gap-1 px-2">
              {tags.map((tag) => (
                <span
                  key={tag.name}
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    tag.enforcement === 'required'
                      ? 'bg-red-100 text-red-700'
                      : tag.enforcement === 'recommended'
                        ? 'bg-yellow-100 text-yellow-700'
                        : tag.enforcement === 'deprecated'
                          ? 'bg-gray-200 text-gray-500 line-through'
                          : 'bg-gray-100 text-gray-600'
                  }`}
                  title={tag.purpose}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>

          {/* Constraint picker */}
          <ConstraintPicker
            constraints={constraints}
            onInsert={handleInsertConstraint}
          />
        </aside>

        {/* Center: XML Editor */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <XmlEditor
              value={content}
              onChange={handleContentChange}
              tags={tags}
            />
          </div>
        </main>

        {/* Right panel: Preview + Verification */}
        <aside className="w-80 border-l border-gray-200 bg-white overflow-y-auto shrink-0 flex flex-col">
          <div className="border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide p-3">
              Preview
            </h3>
            <div className="max-h-64 overflow-y-auto">
              <PromptPreview content={content} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide p-3">
              Verification
            </h3>
            <VerificationPanel
              result={verification}
              isVerifying={isVerifying}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
