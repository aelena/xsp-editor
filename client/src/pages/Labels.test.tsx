import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Labels } from './Labels.tsx'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockApi(handlers: Record<string, (init?: RequestInit) => Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    for (const [pattern, handler] of Object.entries(handlers).sort(
      (a, b) => b[0].length - a[0].length,
    )) {
      const [method, path] = pattern.split(' ')
      if (url.includes(path) && (init?.method ?? 'GET') === method) {
        return Promise.resolve(handler(init))
      }
    }
    return Promise.resolve(json({ error: `unhandled ${init?.method ?? 'GET'} ${url}` }, 500))
  })
}

const USAGE = {
  labels: [
    { label: 'nlp', count: 3, prompts: 2, templates: 1 },
    { label: 'draft', count: 1, prompts: 1, templates: 0 },
  ],
}

const BASE = { 'GET /labels': () => json(USAGE) }

afterEach(() => vi.restoreAllMocks())

describe('Labels', () => {
  it('lists every label with its counts', async () => {
    mockApi(BASE)
    render(<Labels />, { wrapper: createWrapper() })

    const row = (await screen.findByText('nlp')).closest('tr')!
    expect(row).toHaveTextContent('3')
    expect(row).toHaveTextContent('2')
    expect(row).toHaveTextContent('1')
  })

  it('says there are none rather than showing an empty table', async () => {
    mockApi({ 'GET /labels': () => json({ labels: [] }) })
    render(<Labels />, { wrapper: createWrapper() })

    expect(await screen.findByText(/No labels yet/)).toBeInTheDocument()
  })

  it('points at the tag registry, which is a different thing', async () => {
    // The two are one word apart and mean nothing alike. Saying so on the page
    // is cheaper than the support question.
    mockApi(BASE)
    render(<Labels />, { wrapper: createWrapper() })

    expect(await screen.findByRole('link', { name: 'tag registry' })).toHaveAttribute(
      'href',
      '/tags',
    )
  })

  it('shows which artifacts carry a label', async () => {
    mockApi({
      ...BASE,
      'GET /labels/nlp/artifacts': () =>
        json({ artifacts: [{ kind: 'prompt', key: 'p1' }, { kind: 'template', key: 't1' }] }),
    })
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'nlp' }))

    expect(await screen.findByText('Carrying nlp')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'p1' })).toHaveAttribute('href', '/prompts/p1/edit')
  })

  it('renames across everything and says how many were touched', async () => {
    mockApi({
      ...BASE,
      'PUT /labels/nlp': () => json({ label: 'language', affected: 3 }),
    })
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Rename nlp' }))
    const field = screen.getByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'language')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(await screen.findByText('Renamed on 3 items.')).toBeInTheDocument()
  })

  it('warns before a rename that would merge two labels', async () => {
    // Merging is the point of renaming half the time, but it should not be a
    // surprise: one of the two names disappears.
    mockApi(BASE)
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Rename nlp' }))
    const field = screen.getByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'draft')

    expect(screen.getByText(/will be merged/)).toBeInTheDocument()
  })

  it('says a merge happened rather than calling it a rename', async () => {
    mockApi({ ...BASE, 'PUT /labels/nlp': () => json({ label: 'draft', affected: 3 }) })
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Rename nlp' }))
    const field = screen.getByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'draft')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(await screen.findByText(/Merged into draft/)).toBeInTheDocument()
  })

  it('will not submit an empty new name', async () => {
    mockApi(BASE)
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Rename nlp' }))
    await userEvent.clear(screen.getByRole('textbox'))

    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled()
  })

  it('asks before removing, and says how many items it touches', async () => {
    mockApi(BASE)
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Remove nlp' }))

    expect(screen.getByText(/from 3 item/)).toBeInTheDocument()
    // And says what it does not do, because "remove" next to a count of three
    // reads like it might delete three prompts.
    expect(screen.getByText(/items themselves are not touched/)).toBeInTheDocument()
  })

  it('removes when confirmed', async () => {
    mockApi({ ...BASE, 'DELETE /labels/nlp': () => json({ removed: 'nlp', affected: 3 }) })
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Remove nlp' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }))

    expect(await screen.findByText('Removed from 3 items.')).toBeInTheDocument()
  })

  it('does nothing when the removal is cancelled', async () => {
    const spy = mockApi(BASE)
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Remove nlp' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('button', { name: 'Remove it' })).not.toBeInTheDocument()
    expect(spy.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(false)
  })

  it('reports a failure rather than claiming success', async () => {
    mockApi({ ...BASE, 'DELETE /labels/nlp': () => json({ error: 'Storage exploded' }, 500) })
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Remove nlp' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }))

    await waitFor(() => expect(screen.getByText('Storage exploded')).toBeInTheDocument())
  })

  it('uses the singular for one item', async () => {
    mockApi({ ...BASE, 'DELETE /labels/draft': () => json({ removed: 'draft', affected: 1 }) })
    render(<Labels />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Remove draft' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }))

    expect(await screen.findByText('Removed from 1 item.')).toBeInTheDocument()
  })
})
