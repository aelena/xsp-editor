import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import Help from './Help.tsx'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const renderHelp = () =>
  render(
    <MemoryRouter>
      <Help />
    </MemoryRouter>,
  )

afterEach(() => vi.restoreAllMocks())

describe('Help', () => {
  it('says it is loading rather than showing an empty page', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderHelp()

    expect(screen.getByText('Loading manual...')).toBeInTheDocument()
  })

  it('renders the manual the server sends', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ content: '# The Manual\n\nHow to use this thing.' }),
    )
    renderHelp()

    expect(await screen.findByText(/How to use this thing/)).toBeInTheDocument()
    expect(screen.queryByText('Loading manual...')).not.toBeInTheDocument()
  })

  it('shows why the manual could not be loaded', async () => {
    // The manual is read off disk by the server, so a missing file is a real
    // outcome. Leaving the page on "Loading" for ever is the wrong answer to it.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: 'User manual not found' }, 404),
    )
    renderHelp()

    expect(await screen.findByText('User manual not found')).toBeInTheDocument()
    expect(screen.queryByText('Loading manual...')).not.toBeInTheDocument()
  })

  it('offers a way back', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderHelp()

    expect(screen.getByRole('link', { name: /Back to Prompts/ })).toHaveAttribute(
      'href',
      '/prompts',
    )
  })
})
