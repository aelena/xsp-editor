import { apiFetch } from './client.ts'
import { verificationResultSchema } from './schemas.ts'
import type { z } from 'zod'

export type CheckResult = z.infer<typeof verificationResultSchema>['checks'][number]
export type AntiPatternResult = z.infer<typeof verificationResultSchema>['anti_pattern_scan'][number]
export type VerificationResult = z.infer<typeof verificationResultSchema>

export interface VerifyRequest {
  content: string
  variables?: Record<string, { description: string; required?: boolean }>
}

export function verifyContent(request: VerifyRequest): Promise<VerificationResult> {
  return apiFetch<VerificationResult>('/verify', {
    method: 'POST',
    body: JSON.stringify(request),
  }, verificationResultSchema)
}
