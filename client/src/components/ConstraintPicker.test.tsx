import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ConstraintPicker from './ConstraintPicker.tsx'
import type { Constraint } from '../api/constraints.ts'

function makeConstraint(overrides: Partial<Constraint> = {}): Constraint {
  return {
    id: 'GEN-001',
    description: 'No fabricated information',
    severity: 'critical',
    category: 'content',
    owner: 'team',
    status: 'active',
    xml_block: '<constraint id="GEN-001" severity="critical">No fabricated information</constraint>',
    usage_count: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ConstraintPicker', () => {
  it('shows empty state when no constraints', () => {
    render(<ConstraintPicker constraints={[]} onInsert={() => {}} />)
    expect(screen.getByText(/No constraints available/)).toBeInTheDocument()
  })

  it('renders active constraints', () => {
    const constraints = [
      makeConstraint({ id: 'GEN-001', description: 'No fabrication' }),
      makeConstraint({ id: 'PII-001', description: 'No PII', severity: 'critical' }),
    ]
    render(<ConstraintPicker constraints={constraints} onInsert={() => {}} />)
    expect(screen.getByText('GEN-001')).toBeInTheDocument()
    expect(screen.getByText('PII-001')).toBeInTheDocument()
  })

  it('filters out non-active constraints', () => {
    const constraints = [
      makeConstraint({ id: 'GEN-001', status: 'active' }),
      makeConstraint({ id: 'OLD-001', status: 'retired' }),
      makeConstraint({ id: 'DEP-001', status: 'deprecated' }),
    ]
    render(<ConstraintPicker constraints={constraints} onInsert={() => {}} />)
    expect(screen.getByText('GEN-001')).toBeInTheDocument()
    expect(screen.queryByText('OLD-001')).not.toBeInTheDocument()
    expect(screen.queryByText('DEP-001')).not.toBeInTheDocument()
  })

  it('calls onInsert with xml_block when clicked', async () => {
    const onInsert = vi.fn()
    const constraint = makeConstraint()
    const user = userEvent.setup()

    render(<ConstraintPicker constraints={[constraint]} onInsert={onInsert} />)

    await user.click(screen.getByText('GEN-001'))
    expect(onInsert).toHaveBeenCalledWith(constraint.xml_block)
  })

  it('displays severity badges', () => {
    const constraints = [
      makeConstraint({ id: 'C1', severity: 'critical' }),
      makeConstraint({ id: 'C2', severity: 'medium' }),
    ]
    render(<ConstraintPicker constraints={constraints} onInsert={() => {}} />)
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
  })
})
