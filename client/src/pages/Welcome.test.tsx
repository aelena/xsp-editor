import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Welcome from './Welcome.tsx'

const STORAGE_KEY = 'xsp-editor-welcome-dismissed'

function renderWelcome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/prompts" element={<p>The prompt list</p>} />
        <Route path="/help" element={<p>The manual</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.removeItem(STORAGE_KEY))
afterEach(() => localStorage.removeItem(STORAGE_KEY))

describe('Welcome', () => {
  it('greets someone arriving for the first time', () => {
    renderWelcome()
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeInTheDocument()
  })

  it('goes to the prompt list on Get Started', async () => {
    renderWelcome()
    await userEvent.click(screen.getByRole('button', { name: 'Get Started' }))
    expect(await screen.findByText('The prompt list')).toBeInTheDocument()
  })

  it('does not remember the dismissal unless asked to', async () => {
    // Continuing once is not the same as never wanting to see it again.
    renderWelcome()
    await userEvent.click(screen.getByRole('button', { name: 'Get Started' }))

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('remembers when the box is ticked', async () => {
    renderWelcome()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Get Started' }))

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('skips straight past on a later visit', async () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    renderWelcome()

    await waitFor(() =>
      expect(screen.getByText('The prompt list')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Get Started' })).not.toBeInTheDocument()
  })

  it('links to the manual', async () => {
    renderWelcome()
    await userEvent.click(screen.getByRole('link', { name: 'Read the User Manual' }))
    expect(await screen.findByText('The manual')).toBeInTheDocument()
  })
})
