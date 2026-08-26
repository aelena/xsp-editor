import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CommandPalette } from './CommandPalette.tsx'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(make: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(make()))
}

const HITS = {
  query: 'classify',
  total: 2,
  hits: [
    {
      kind: 'prompt',
      key: '11111111-0000-4000-8000-000000000001',
      title: 'classify-intent',
      context: 'Decide what the customer wants',
      field: 'name',
    },
    {
      kind: 'constraint',
      key: 'GEN-001',
      title: 'GEN-001',
      context: 'Never emit personal data',
      field: 'description',
    },
  ],
}

function renderPalette() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/prompts']}>
        <CommandPalette />
        <Routes>
          <Route path="/prompts" element={<p>Prompt list</p>} />
          <Route path="/prompts/new" element={<p>New prompt page</p>} />
          <Route path="/labels" element={<p>Labels page</p>} />
          <Route path="/prompts/:id/edit" element={<p>Editing a prompt</p>} />
          <Route path="/constraints" element={<p>Constraints page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const openIt = () => userEvent.keyboard('{Control>}k{/Control}')

afterEach(() => vi.restoreAllMocks())

describe('opening and closing', () => {
  it('stays out of the way until asked for', () => {
    renderPalette()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on Ctrl and K', async () => {
    renderPalette()
    await openIt()
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })

  it('closes on the same shortcut', async () => {
    renderPalette()
    await openIt()
    await openIt()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderPalette()
    await openIt()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when the backdrop is clicked', async () => {
    renderPalette()
    await openIt()
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not close when the panel itself is clicked', async () => {
    renderPalette()
    await openIt()
    await userEvent.click(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('focuses the input, so typing works without a click', async () => {
    renderPalette()
    await openIt()
    expect(screen.getByLabelText('Search or run a command')).toHaveFocus()
  })
})

describe('commands', () => {
  it('lists every destination before anything is typed', async () => {
    renderPalette()
    await openIt()

    expect(screen.getByRole('option', { name: /New prompt/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Labels/ })).toBeInTheDocument()
  })

  it('filters as you type', async () => {
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'label')

    expect(screen.getByRole('option', { name: /Labels/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Playground/ })).not.toBeInTheDocument()
  })

  it('navigates on Enter', async () => {
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'new prompt')
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByText('New prompt page')).toBeInTheDocument()
  })

  it('navigates on click', async () => {
    renderPalette()
    await openIt()
    await userEvent.click(screen.getByRole('option', { name: /Labels/ }))

    expect(await screen.findByText('Labels page')).toBeInTheDocument()
  })

  it('closes itself after navigating', async () => {
    renderPalette()
    await openIt()
    await userEvent.click(screen.getByRole('option', { name: /Labels/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves the selection with the arrow keys', async () => {
    renderPalette()
    await openIt()
    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('does not run off either end of the list', async () => {
    renderPalette()
    await openIt()

    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    const options = screen.getAllByRole('option')
    await userEvent.keyboard('{ArrowDown}'.repeat(options.length + 5))
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true')
  })
})

describe('search results', () => {
  it('shows hits alongside the commands', async () => {
    mockFetch(() => json(HITS))
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'classify')

    expect(await screen.findByRole('option', { name: /classify-intent/ })).toBeInTheDocument()
    expect(screen.getByText('Decide what the customer wants')).toBeInTheDocument()
  })

  it('says what kind each hit is', async () => {
    mockFetch(() => json(HITS))
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'classify')

    await screen.findByRole('option', { name: /classify-intent/ })
    expect(screen.getByText('Prompt')).toBeInTheDocument()
    expect(screen.getByText('Constraint')).toBeInTheDocument()
  })

  it('puts commands above hits', async () => {
    // Someone typing "prompts" almost always wants the page, not the four
    // prompts whose description mentions the word.
    mockFetch(() => json(HITS))
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'prompt')

    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1))
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/New prompt|Prompts/)
  })

  it('opens the prompt a hit points at', async () => {
    mockFetch(() => json(HITS))
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'classify')

    await userEvent.click(await screen.findByRole('option', { name: /classify-intent/ }))
    expect(await screen.findByText('Editing a prompt')).toBeInTheDocument()
  })

  it('sends a constraint hit to the constraint library', async () => {
    // Only prompts have a page of their own, so the rest go to the list they
    // live on. Better than a dead row that looks clickable.
    mockFetch(() => json(HITS))
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'classify')

    await userEvent.click(await screen.findByRole('option', { name: /GEN-001/ }))
    expect(await screen.findByText('Constraints page')).toBeInTheDocument()
  })

  it('says when there is more than it is showing', async () => {
    mockFetch(() => json({ ...HITS, total: 40 }))
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'classify')

    expect(await screen.findByText(/Showing 2 of 40 matches/)).toBeInTheDocument()
  })

  it('says nothing matched rather than showing an empty list', async () => {
    mockFetch(() => json({ query: 'zzz', total: 0, hits: [] }))
    renderPalette()
    await openIt()
    await userEvent.type(screen.getByLabelText('Search or run a command'), 'zzzznothing')

    expect(await screen.findByText(/Nothing matches zzzznothing/)).toBeInTheDocument()
  })

  it('does not search before anything is typed', async () => {
    const spy = mockFetch(() => json(HITS))
    renderPalette()
    await openIt()

    expect(spy).not.toHaveBeenCalled()
  })
})
