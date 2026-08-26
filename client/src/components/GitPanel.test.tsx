import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { GitStatusList, CommitDialog } from './GitPanel.tsx'

const CHANGES = [
  { status: 'M', path: 'src/edited.ts' },
  { status: '??', path: 'src/new.ts' },
  { status: 'D', path: 'src/gone.ts' },
]

describe('GitStatusList', () => {
  it('renders nothing at all when the tree is clean', () => {
    // Not an empty box with a heading. A panel that says "Git Changes" over
    // nothing is a panel taking up space to report the absence of news.
    const { container } = render(<GitStatusList gitStatus={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each changed path with its status letter', () => {
    render(<GitStatusList gitStatus={CHANGES} />)

    expect(screen.getByText('src/edited.ts')).toBeInTheDocument()
    expect(screen.getByText('src/new.ts')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('??')).toBeInTheDocument()
  })

  it('shows the heading only when there is something under it', () => {
    render(<GitStatusList gitStatus={CHANGES} />)
    expect(screen.getByText('Git Changes')).toBeInTheDocument()
  })
})

describe('CommitDialog', () => {
  const props = {
    gitStatus: CHANGES,
    onCommit: vi.fn(),
    onClose: vi.fn(),
    isCommitting: false,
  }

  it('says how many files are about to be committed', () => {
    render(<CommitDialog {...props} />)
    expect(screen.getByText('3 file(s) changed')).toBeInTheDocument()
  })

  it('will not commit without a message', async () => {
    const onCommit = vi.fn()
    render(<CommitDialog {...props} onCommit={onCommit} />)

    expect(screen.getByRole('button', { name: 'Commit' })).toBeDisabled()
  })

  it('will not commit a message of only whitespace', async () => {
    const onCommit = vi.fn()
    render(<CommitDialog {...props} onCommit={onCommit} />)

    await userEvent.type(screen.getByPlaceholderText('Commit message...'), '   ')
    expect(screen.getByRole('button', { name: 'Commit' })).toBeDisabled()
  })

  it('commits the message and closes', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<CommitDialog {...props} onCommit={onCommit} onClose={onClose} />)

    await userEvent.type(screen.getByPlaceholderText('Commit message...'), 'Fix the thing')
    await userEvent.click(screen.getByRole('button', { name: 'Commit' }))

    expect(onCommit).toHaveBeenCalledWith('Fix the thing')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes without committing on cancel', async () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitDialog {...props} onCommit={onCommit} onClose={onClose} />)

    await userEvent.type(screen.getByPlaceholderText('Commit message...'), 'Never mind')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCommit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('disables the button while a commit is in flight', () => {
    // Otherwise an impatient second click makes a second commit of the same
    // message.
    render(<CommitDialog {...props} isCommitting />)
    expect(screen.getByRole('button', { name: 'Committing...' })).toBeDisabled()
  })
})
