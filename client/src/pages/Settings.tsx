import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  useLLMConfig,
  useUpdateLLMConfig,
  useTestConnection,
} from '../api/llm.ts'

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
  'azure-openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  custom: [],
}

export default function Settings() {
  const { data: config, isLoading } = useLLMConfig()
  const updateConfig = useUpdateLLMConfig()
  const testConnection = useTestConnection()

  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [maxTokens, setMaxTokens] = useState(1024)
  const [temperature, setTemperature] = useState(0)
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  useEffect(() => {
    if (config) {
      setProvider(config.provider || 'anthropic')
      setModel(config.model || '')
      setMaxTokens(config.default_max_tokens)
      setTemperature(config.default_temperature)
      setCustomBaseUrl(config.custom_base_url || '')
    }
  }, [config])

  const models = PROVIDER_MODELS[provider] || []

  const handleSave = async () => {
    if (!apiKey && !config?.api_key_set) return
    await updateConfig.mutateAsync({
      provider: provider as 'anthropic' | 'openai' | 'azure-openai' | 'custom',
      model: model || models[0] || 'gpt-4o',
      api_key: apiKey || 'unchanged',
      default_max_tokens: maxTokens,
      default_temperature: temperature,
      custom_base_url:
        provider === 'custom' || provider === 'azure-openai'
          ? customBaseUrl || null
          : null,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestConnection = async () => {
    setTestResult(null)
    const result = await testConnection.mutateAsync()
    setTestResult(result.success)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 dark:text-gray-400 dark:bg-gray-950">
        Loading settings...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            to="/prompts/new"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            &larr; Back to Editor
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            LLM Configuration
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-5 shadow-sm dark:shadow-gray-900/50">
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                setModel('')
              }}
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="azure-openai">Azure OpenAI</option>
              <option value="custom">Custom (OpenAI-compatible)</option>
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Model
            </label>
            {models.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Select a model...</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Model name"
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
              />
            )}
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                config?.api_key_set ? '••••••••••••• (key is set)' : 'Enter API key'
              }
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          {/* Custom Base URL */}
          {(provider === 'custom' || provider === 'azure-openai') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base URL
              </label>
              <input
                type="url"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="https://your-endpoint.com/v1"
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          )}

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Tokens
              </label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1024)}
                min={1}
                max={200000}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Temperature
              </label>
              <input
                type="number"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                min={0}
                max={2}
                step={0.1}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={updateConfig.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {updateConfig.isPending ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={testConnection.isPending || !config?.api_key_set}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 dark:text-gray-300"
            >
              {testConnection.isPending ? 'Testing...' : 'Test Connection'}
            </button>
            {saved && (
              <span className="text-sm text-green-600">Saved!</span>
            )}
            {testResult === true && (
              <span className="text-sm text-green-600">Connection successful</span>
            )}
            {testResult === false && (
              <span className="text-sm text-red-600">Connection failed</span>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
