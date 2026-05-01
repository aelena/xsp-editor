import type { VerificationResult } from '../api/verify.ts'
import {
  ANTIPATTERN_FIXES,
  CHECK_FIXES,
} from '../services/antipattern-fixes.ts'

interface VerificationPanelProps {
  result: VerificationResult | null
  isVerifying: boolean
  content?: string
  onApplyFix?: (fixedContent: string) => void
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
  content,
  onApplyFix,
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

  const handleCheckFix = (rule: string) => {
    if (!content || !onApplyFix) return
    const fix = CHECK_FIXES.find((f) => f.rule === rule)
    if (!fix) return
    const fixed = fix.apply(content)
    if (fixed !== null) onApplyFix(fixed)
  }

  const handleAntiPatternFix = (pattern: string) => {
    if (!content || !onApplyFix) return
    const fix = ANTIPATTERN_FIXES.find((f) => f.pattern === pattern)
    if (!fix) return
    const fixed = fix.apply(content)
    if (fixed !== null) onApplyFix(fixed)
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
            const checkFix =
              check.status !== 'passed'
                ? CHECK_FIXES.find((f) => f.rule === check.rule)
                : null
            const canFix = checkFix && content && onApplyFix

            return (
              <li key={check.rule} className="flex items-start gap-2 text-sm">
                <span className={`font-mono ${statusColor(check.status)}`}>
                  {statusIcon(check.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium dark:text-gray-200">{check.rule}</span>
                  <span className="text-gray-600 dark:text-gray-400"> — {check.message}</span>
                </div>
                {canFix && (
                  <button
                    onClick={() => handleCheckFix(check.rule)}
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    title={checkFix.label}
                  >
                    Fix
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {result.anti_pattern_scan.some((ap) => ap.detected) && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Anti-Patterns Detected
          </h4>
          <ul className="space-y-1.5">
            {result.anti_pattern_scan
              .filter((ap) => ap.detected)
              .map((ap) => {
                const fix = ANTIPATTERN_FIXES.find(
                  (f) => f.pattern === ap.pattern,
                )
                const canFix = fix && content && onApplyFix

                return (
                  <li
                    key={ap.pattern}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className="text-yellow-600 dark:text-yellow-400 shrink-0">
                      ⚠
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-yellow-700 dark:text-yellow-300">
                        {ap.pattern}
                      </span>
                      {ap.details && (
                        <span className="text-gray-500 dark:text-gray-400">
                          {' '}
                          — {ap.details}
                        </span>
                      )}
                    </div>
                    {canFix && (
                      <button
                        onClick={() => handleAntiPatternFix(ap.pattern)}
                        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-700"
                        title={fix.label}
                      >
                        Fix
                      </button>
                    )}
                  </li>
                )
              })}
          </ul>
        </div>
      )}
    </div>
  )
}
