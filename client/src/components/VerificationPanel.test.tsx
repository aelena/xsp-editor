import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import VerificationPanel from './VerificationPanel.tsx'
import type { VerificationResult } from '../api/verify.ts'

function makeResult(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    status: 'passed',
    score: 100,
    checks: [
      { rule: 'approved_tags', status: 'passed', message: 'All tags are approved' },
      { rule: 'required_tags', status: 'passed', message: 'Required tag <task> is present' },
    ],
    anti_pattern_scan: [
      { pattern: 'Tag Sprawl', detected: false },
    ],
    ...overrides,
  }
}

describe('VerificationPanel', () => {
  it('shows empty state when no result', () => {
    render(<VerificationPanel result={null} isVerifying={false} />)
    expect(screen.getByTestId('verification-empty')).toBeInTheDocument()
    expect(screen.getByText(/Edit your prompt/)).toBeInTheDocument()
  })

  it('shows loading state when verifying', () => {
    render(<VerificationPanel result={null} isVerifying={true} />)
    expect(screen.getByTestId('verification-loading')).toBeInTheDocument()
    expect(screen.getByText('Verifying...')).toBeInTheDocument()
  })

  it('renders passed status with score', () => {
    render(<VerificationPanel result={makeResult()} isVerifying={false} />)
    expect(screen.getByTestId('verification-panel')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('renders failed status', () => {
    const result = makeResult({
      status: 'failed',
      score: 60,
      checks: [
        { rule: 'variable_docs', status: 'failed', message: 'Variable $order_id is used but not documented' },
      ],
    })
    render(<VerificationPanel result={result} isVerifying={false} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
    expect(screen.getByText('variable_docs')).toBeInTheDocument()
  })

  it('renders warnings status', () => {
    const result = makeResult({
      status: 'warnings',
      score: 80,
      checks: [
        { rule: 'empty_sections', status: 'warning', message: 'Section <examples> is empty' },
      ],
    })
    render(<VerificationPanel result={result} isVerifying={false} />)
    expect(screen.getByText('Warnings')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
  })

  it('shows detected anti-patterns', () => {
    const result = makeResult({
      status: 'warnings',
      score: 80,
      anti_pattern_scan: [
        { pattern: 'Tag Sprawl', detected: true, details: 'More than 12 unique tags' },
        { pattern: 'Empty Section Accumulation', detected: false },
      ],
    })
    render(<VerificationPanel result={result} isVerifying={false} />)
    expect(screen.getByText(/Tag Sprawl/)).toBeInTheDocument()
    expect(screen.getByText(/More than 12 unique tags/)).toBeInTheDocument()
  })

  it('does not show anti-pattern section when none detected', () => {
    const result = makeResult()
    render(<VerificationPanel result={result} isVerifying={false} />)
    expect(screen.queryByText('Anti-Patterns Detected')).not.toBeInTheDocument()
  })

  it('renders all check items', () => {
    const result = makeResult({
      checks: [
        { rule: 'approved_tags', status: 'passed', message: 'All tags are approved' },
        { rule: 'required_tags', status: 'passed', message: 'Required tags present' },
        { rule: 'empty_sections', status: 'warning', message: 'Empty section found' },
      ],
    })
    render(<VerificationPanel result={result} isVerifying={false} />)
    expect(screen.getByText('approved_tags')).toBeInTheDocument()
    expect(screen.getByText('required_tags')).toBeInTheDocument()
    expect(screen.getByText('empty_sections')).toBeInTheDocument()
  })
})
