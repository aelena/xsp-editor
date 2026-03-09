import type { VerificationResult } from '../api/verify.ts'

interface VerificationPanelProps {
  result: VerificationResult | null
  isVerifying: boolean
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
      return 'text-green-600'
    case 'warning':
      return 'text-yellow-600'
    case 'failed':
      return 'text-red-600'
  }
}

function overallStatusColor(status: 'passed' | 'warnings' | 'failed') {
  switch (status) {
    case 'passed':
      return 'bg-green-100 text-green-800 border-green-300'
    case 'warnings':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-300'
  }
}

export default function VerificationPanel({
  result,
  isVerifying,
}: VerificationPanelProps) {
  if (isVerifying) {
    return (
      <div data-testid="verification-loading" className="p-4 text-gray-500">
        Verifying...
      </div>
    )
  }

  if (!result) {
    return (
      <div data-testid="verification-empty" className="p-4 text-gray-400">
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
        <div className="text-sm text-gray-600">
          Score: <span className="font-semibold">{result.score}</span>/100
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Checks</h4>
        <ul className="space-y-1">
          {result.checks.map((check) => (
            <li key={check.rule} className="flex items-start gap-2 text-sm">
              <span className={`font-mono ${statusColor(check.status)}`}>
                {statusIcon(check.status)}
              </span>
              <div>
                <span className="font-medium">{check.rule}</span>
                <span className="text-gray-600"> — {check.message}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {result.anti_pattern_scan.some((ap) => ap.detected) && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">
            Anti-Patterns Detected
          </h4>
          <ul className="space-y-1">
            {result.anti_pattern_scan
              .filter((ap) => ap.detected)
              .map((ap) => (
                <li key={ap.pattern} className="text-sm text-yellow-700">
                  ⚠ {ap.pattern}
                  {ap.details && (
                    <span className="text-gray-500"> — {ap.details}</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
