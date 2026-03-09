import { apiFetch } from './client.ts'

export interface CheckResult {
  rule: string
  status: 'passed' | 'warning' | 'failed'
  message: string
  anti_pattern?: string
  details?: string
}

export interface AntiPatternResult {
  pattern: string
  detected: boolean
  details?: string
}

export interface VerificationResult {
  status: 'passed' | 'warnings' | 'failed'
  score: number
  checks: CheckResult[]
  anti_pattern_scan: AntiPatternResult[]
}

export interface VerifyRequest {
  content: string
  variables?: Record<string, { description: string; required?: boolean }>
}

export function verifyContent(request: VerifyRequest): Promise<VerificationResult> {
  return apiFetch<VerificationResult>('/verify', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}
