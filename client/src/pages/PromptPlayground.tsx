import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useRender } from '../api/render.ts'
import { useTestLLM, useLLMConfig, type LLMTestResponse } from '../api/llm.ts'

export default function PromptPlayground() {
  const { data: llmConfig } = useLLMConfig()
  const renderMutation = useRender()
  const testMutation = useTestLLM()

  const [content, setContent] = useState('')
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [rendered, setRendered] = useState('')
  const [tokenEstimate, setTokenEstimate] = useState(0)
  const [llmResult, setLlmResult] = useState<LLMTestResponse | null>(null)
  const [error, setError] = useState('')

  // Extract $variables from content
  const detectedVars = useMemo(() => {
    const varRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g
    const vars = new Set<string>()
    let match
    while ((match = varRegex.exec(content)) !== null) {
      vars.add(match[1])
    }
    return Array.from(vars)
  }, [content])

  const handleRender = async () => {
    setError('')
    try {
      const result = await renderMutation.mutateAsync({ content, variables })
      setRendered(result.rendered)
      setTokenEstimate(result.token_estimate)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleSendToLLM = async () => {
    setError('')
    setLlmResult(null)
    try {
      const result = await testMutation.mutateAsync({ content, variables })
      setLlmResult(result)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/prompts/new"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              &larr; Back to Editor
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Prompt Playground
            </h1>
          </div>
          {llmConfig?.api_key_set && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
              LLM: {llmConfig.model || llmConfig.provider}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Prompt input + variables */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 flex-1 flex flex-col min-h-0">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Prompt Template
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your XSP prompt template here..."
              className="flex-1 w-full border border-gray-300 dark:border-gray-600 rounded p-3 text-sm font-mono resize-none focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />

            {/* Variable inputs */}
            {detectedVars.length > 0 && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Variables ({detectedVars.length})
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {detectedVars.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-purple-600 w-32 shrink-0">
                        ${v}
                      </span>
                      <input
                        type="text"
                        value={variables[v] || ''}
                        onChange={(e) =>
                          setVariables((prev) => ({
                            ...prev,
                            [v]: e.target.value,
                          }))
                        }
                        placeholder={`Value for $${v}`}
                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleRender}
                disabled={!content.trim() || renderMutation.isPending}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 dark:text-gray-300"
              >
                {renderMutation.isPending ? 'Rendering...' : 'Render Preview'}
              </button>
              <button
                onClick={handleSendToLLM}
                disabled={
                  !content.trim() ||
                  !llmConfig?.api_key_set ||
                  testMutation.isPending
                }
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {testMutation.isPending ? 'Sending...' : 'Send to LLM'}
              </button>
              {tokenEstimate > 0 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ~{tokenEstimate} tokens
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm border-b border-red-200">
              {error}
            </div>
          )}

          {/* Rendered preview */}
          {rendered && (
            <div className="border-b border-gray-200 dark:border-gray-700 p-4 max-h-[40%] overflow-y-auto">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Rendered Preview
              </h3>
              <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded whitespace-pre-wrap dark:text-gray-100">
                {rendered}
              </pre>
            </div>
          )}

          {/* LLM Response */}
          {llmResult && (
            <div className="flex-1 p-4 overflow-y-auto">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                LLM Response
              </h3>
              <pre className="text-sm font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded whitespace-pre-wrap mb-4 dark:text-gray-100">
                {llmResult.response}
              </pre>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Model:</span>{' '}
                  <span className="font-medium dark:text-gray-100">{llmResult.model}</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Latency:</span>{' '}
                  <span className="font-medium dark:text-gray-100">{llmResult.latency_ms}ms</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Input tokens:</span>{' '}
                  <span className="font-medium dark:text-gray-100">{llmResult.tokens.input}</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Output tokens:</span>{' '}
                  <span className="font-medium dark:text-gray-100">{llmResult.tokens.output}</span>
                </div>
                {llmResult.output_validation.is_valid_json && (
                  <div className="col-span-2 bg-green-50 text-green-700 p-2 rounded">
                    Valid JSON output
                  </div>
                )}
              </div>
            </div>
          )}

          {!rendered && !llmResult && !error && (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              Render a preview or send to LLM to see results
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
