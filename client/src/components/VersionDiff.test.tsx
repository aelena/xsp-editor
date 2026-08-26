import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { VersionDiff } from './VersionDiff.tsx'

const props = {
  fromLabel: '1.0.0',
  fromText: '<task>Classify</task>',
  toLabel: '1.1.0',
  toText: '<task>Classify the intent</task>',
}

describe('VersionDiff', () => {
  it('names both sides', () => {
    render(<VersionDiff {...props} />)
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
    expect(screen.getByText(/1\.1\.0/)).toBeInTheDocument()
  })

  it('counts what changed', () => {
    render(<VersionDiff {...props} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('−1')).toBeInTheDocument()
  })

  it('says there are no differences rather than showing an empty panel', () => {
    // "No differences" and "failed to load" look the same when both are blank.
    render(<VersionDiff {...props} toText={props.fromText} />)
    expect(screen.getByText('No differences.')).toBeInTheDocument()
  })

  it('shows both the old line and the new one', () => {
    render(<VersionDiff {...props} />)
    expect(screen.getByText('<task>Classify</task>')).toBeInTheDocument()
    expect(screen.getByText('<task>Classify the intent</task>')).toBeInTheDocument()
  })

  it('says in words which side a line is on, not only in colour', () => {
    // Red and green carry the whole message otherwise, which excludes anyone
    // who cannot distinguish them or is using a screen reader.
    render(<VersionDiff {...props} />)
    expect(screen.getByText('Added:')).toBeInTheDocument()
    expect(screen.getByText('Removed:')).toBeInTheDocument()
  })

  it('collapses a long unchanged stretch and offers to show it', async () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`)
    const after = [...before]
    after[20] = 'changed'

    render(
      <VersionDiff
        fromLabel="a"
        fromText={before.join('\n')}
        toLabel="b"
        toText={after.join('\n')}
      />,
    )

    expect(screen.queryByText('line 0')).not.toBeInTheDocument()
    const reveal = screen.getByRole('button', { name: /Show \d+ unchanged lines/ })

    await userEvent.click(reveal)
    expect(screen.getByText('line 0')).toBeInTheDocument()
  })

  it('collapses again after expanding', async () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`)
    const after = [...before]
    after[20] = 'changed'

    render(
      <VersionDiff fromLabel="a" fromText={before.join('\n')} toLabel="b" toText={after.join('\n')} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Show \d+ unchanged lines/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }))

    expect(screen.queryByText('line 0')).not.toBeInTheDocument()
  })

  it('offers nothing to expand when there is nothing hidden', () => {
    render(<VersionDiff {...props} />)
    expect(screen.queryByRole('button', { name: /unchanged/ })).not.toBeInTheDocument()
  })

  it('survives a version that was empty', () => {
    render(<VersionDiff fromLabel="a" fromText="" toLabel="b" toText="something" />)
    expect(screen.getByText('something')).toBeInTheDocument()
  })
})
