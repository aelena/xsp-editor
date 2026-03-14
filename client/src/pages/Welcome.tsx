import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const STORAGE_KEY = 'xsp-editor-welcome-dismissed'

export default function Welcome() {
  const navigate = useNavigate()
  const [doNotShow, setDoNotShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      navigate('/prompts', { replace: true })
    }
  }, [navigate])

  function handleContinue() {
    if (doNotShow) {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    navigate('/prompts', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 shadow-lg dark:shadow-gray-900/50 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Welcome to XSP Editor
        </h1>
        <p className="mt-4 text-gray-600 dark:text-gray-400 leading-relaxed">
          Create, edit, and verify XML-based structured prompts with real-time
          validation, tag autocomplete, and constraint checking.
        </p>

        <ul className="mt-6 space-y-2 text-left text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-500">&#9679;</span>
            <span><strong className="text-gray-900 dark:text-gray-100">Prompt Editor</strong> &mdash; CodeMirror-powered XML editing with autocomplete</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-500">&#9679;</span>
            <span><strong className="text-gray-900 dark:text-gray-100">Verification</strong> &mdash; Real-time linting and constraint checks</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-500">&#9679;</span>
            <span><strong className="text-gray-900 dark:text-gray-100">Tag Registry</strong> &mdash; Manage reusable XML tags and schemas</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-500">&#9679;</span>
            <span><strong className="text-gray-900 dark:text-gray-100">Templates</strong> &mdash; Jumpstart new prompts from starter templates</span>
          </li>
        </ul>

        <div className="mt-8">
          <button
            onClick={handleContinue}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors"
          >
            Get Started
          </button>
        </div>

        <div className="mt-3">
          <Link
            to="/help"
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            Read the User Manual
          </Link>
        </div>

        <label className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={doNotShow}
            onChange={(e) => setDoNotShow(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          Don't show this again
        </label>
      </div>
    </div>
  )
}
