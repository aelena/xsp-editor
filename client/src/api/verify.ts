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

export interface VerifyFixRequest {
  content: string
  rule: string
  message: string
  variables?: Record<string, { description: string; required?: boolean }>
}

export interface VerifyFixResponse {
  content?: string
  variables?: Record<string, { description: string; required?: boolean }>
}

export function verifyFix(request: VerifyFixRequest): Promise<VerifyFixResponse> {
  return apiFetch<VerifyFixResponse>('/verify/fix', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export const FIXABLE_VERIFICATION_RULES = new Set([
  'empty_sections',
  'cdata_for_input',
  'variable_docs',
])

export function isVerificationFixable(rule: string): boolean {
  return FIXABLE_VERIFICATION_RULES.has(rule)
}
