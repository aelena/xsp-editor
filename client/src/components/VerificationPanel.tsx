import type { VerificationResult, CheckResult } from '../api/verify.ts'
import { isVerificationFixable } from '../api/verify.ts'

interface VerificationPanelProps {
  result: VerificationResult | null
  isVerifying: boolean
  onFix?: (check: CheckResult) => void
  fixingRule?: string | null
  fixError?: string | null
  onDismissFixError?: () => void
}

function statusIcon(status: 'passed' | 'warning' | 'failed') {
  switch (status) {
    case 'passed':
      return '✓'
    case 'warning':
      return '⚠'
    case 'failed':
      return '✗'
  }
}

function statusColor(status: 'passed' | 'warning' | 'failed') {
  switch (status) {
    case 'passed':
      return 'text-green-600 dark:text-green-400'
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400'
    case 'failed':
      return 'text-red-600 dark:text-red-400'
  }
}

function overallStatusColor(status: 'passed' | 'warnings' | 'failed') {
  switch (status) {
    case 'passed':
      return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-300 dark:border-green-600'
    case 'warnings':
      return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-600'
    case 'failed':
      return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-600'
  }
}

export default function VerificationPanel({
  result,
  isVerifying,
  onFix,
  fixingRule,
  fixError,
  onDismissFixError,
}: VerificationPanelProps) {
  if (isVerifying) {
    return (
      <div data-testid="verification-loading" className="p-4 text-gray-500 dark:text-gray-400">
        Verifying...
      </div>
    )
  }

  if (!result) {
    return (
      <div data-testid="verification-empty" className="p-4 text-gray-400 dark:text-gray-500">
        Edit your prompt to see verification results.
      </div>
    )
  }

  return (
    <div data-testid="verification-panel" className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div
          className={`px-3 py-1 rounded border text-sm font-medium ${overallStatusColor(result.status)}`}
        >
          {result.status === 'passed'
            ? 'Passed'
            : result.status === 'warnings'
              ? 'Warnings'
              : 'Failed'}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Score: <span className="font-semibold">{result.score}</span>/100
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Checks</h4>
        <ul className="space-y-1">
          {result.checks.map((check) => {
            const showFix =
              onFix &&
              (check.status === 'warning' || check.status === 'failed') &&
              isVerificationFixable(check.rule)
            const isFixing = fixingRule === check.rule
            return (
              <li key={check.rule} className="flex items-start gap-2 text-sm">
                <span className={`font-mono shrink-0 ${statusColor(check.status)}`}>
                  {statusIcon(check.status)}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium dark:text-gray-200">{check.rule}</span>
                  <span className="text-gray-600 dark:text-gray-400"> — {check.message}</span>
                </div>
                {showFix && (
                  <button
                    type="button"
                    onClick={() => !isFixing && onFix(check)}
                    disabled={isFixing}
                    className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Apply fix"
                  >
                    {isFixing ? '…' : 'FIX'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {fixError && (
        <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 p-2 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{fixError}</span>
          {onDismissFixError && (
            <button
              type="button"
              onClick={onDismissFixError}
              className="shrink-0 text-red-500 hover:text-red-700 dark:text-red-400"
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      )}

      {result.anti_pattern_scan.some((ap) => ap.detected) && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Anti-Patterns Detected
          </h4>
          <ul className="space-y-1">
            {result.anti_pattern_scan
              .filter((ap) => ap.detected)
              .map((ap) => (
                <li key={ap.pattern} className="text-sm text-yellow-700 dark:text-yellow-300">
                  ⚠ {ap.pattern}
                  {ap.details && (
                    <span className="text-gray-500 dark:text-gray-400"> — {ap.details}</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
