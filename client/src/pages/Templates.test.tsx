import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import Templates from './Templates.tsx'

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

const TEMPLATES = [
  {
    name: 'review-checklist',
    description: 'A checklist for reviews',
    content: '<task>Review</task>',
    category: 'review',
    is_builtin: false,
    created_at: '',
    updated_at: '',
    projects: [],
  },
  {
    name: 'base-prompt',
    description: 'The shipped starting point',
    content: '<task></task>',
    category: 'general',
    is_builtin: true,
    created_at: '',
    updated_at: '',
    projects: [],
  },
]

function mockApi(handlers: Record<string, (init?: RequestInit) => Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    for (const [pattern, handler] of Object.entries(handlers)) {
      const [method, path] = pattern.split(' ')
      if (url.includes(path) && (init?.method ?? 'GET') === method) {
        return Promise.resolve(handler(init))
      }
    }
    return Promise.resolve(json({ error: `unhandled ${init?.method ?? 'GET'} ${url}` }, 500))
  })
}

const BASE = { 'GET /templates': () => json({ templates: TEMPLATES }) }

afterEach(() => vi.restoreAllMocks())

describe('Templates', () => {
  it('lists what is there, with the count', async () => {
    mockApi(BASE)
    render(<Templates />, { wrapper: createWrapper() })

    expect(await screen.findByText('2 templates')).toBeInTheDocument()
    expect(screen.getByText('review checklist')).toBeInTheDocument()
  })

  it('marks the shipped ones as built in', async () => {
    mockApi(BASE)
    render(<Templates />, { wrapper: createWrapper() })

    expect(await screen.findByText('built-in')).toBeInTheDocument()
  })

  it('filters by name, description or category', async () => {
    mockApi(BASE)
    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')

    const search = screen.getByPlaceholderText('Search templates...')

    await userEvent.type(search, 'shipped')
    expect(screen.getByText('base prompt')).toBeInTheDocument()
    expect(screen.queryByText('review checklist')).not.toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, 'review')
    expect(screen.getByText('review checklist')).toBeInTheDocument()
  })

  it('says nothing matched rather than showing an empty page', async () => {
    mockApi(BASE)
    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')

    await userEvent.type(screen.getByPlaceholderText('Search templates...'), 'zzzz')
    expect(screen.getByText('No templates match your search')).toBeInTheDocument()
  })

  it('distinguishes an empty library from an empty search', async () => {
    // Two different situations with two different next actions: create one, or
    // clear the box.
    mockApi({ 'GET /templates': () => json({ templates: [] }) })
    render(<Templates />, { wrapper: createWrapper() })

    expect(await screen.findByText('No templates yet')).toBeInTheDocument()
  })

  it('opens an empty form for a new template', async () => {
    mockApi(BASE)
    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')

    await userEvent.click(screen.getByRole('button', { name: '+ New Template' }))

    expect(screen.getByPlaceholderText('my-template (lowercase, hyphens)')).toHaveValue('')
    expect(screen.getByPlaceholderText('<task>...</task>')).toHaveValue('')
  })

  it('refuses to create one with missing fields, before asking the server', async () => {
    const spy = mockApi(BASE)
    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')

    await userEvent.click(screen.getByRole('button', { name: '+ New Template' }))
    await userEvent.type(screen.getByPlaceholderText('my-template (lowercase, hyphens)'), 'x')
    await userEvent.click(screen.getByRole('button', { name: /Create/ }))

    expect(screen.getByText('Name, description, and content are required')).toBeInTheDocument()
    expect(spy.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'POST')).toBe(false)
  })

  it('creates one', async () => {
    const posted: string[] = []
    mockApi({
      ...BASE,
      'POST /templates': (init) => {
        posted.push(String(init?.body))
        return json(TEMPLATES[0], 201)
      },
    })

    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')
    await userEvent.click(screen.getByRole('button', { name: '+ New Template' }))

    await userEvent.type(screen.getByPlaceholderText('my-template (lowercase, hyphens)'), 'new-one')
    await userEvent.type(screen.getByPlaceholderText('What this template is for...'), 'Does a thing')
    await userEvent.type(screen.getByPlaceholderText('<task>...</task>'), '<task>x</task>')
    await userEvent.click(screen.getByRole('button', { name: /Create/ }))

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(JSON.parse(posted[0]).name).toBe('new-one')
  })

  it('shows the server error instead of closing the form', async () => {
    // Closing on failure loses whatever was typed, and the person has to
    // remember it to try again.
    mockApi({
      ...BASE,
      'POST /templates': () => json({ error: "Template 'new-one' already exists" }, 409),
    })

    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')
    await userEvent.click(screen.getByRole('button', { name: '+ New Template' }))
    await userEvent.type(screen.getByPlaceholderText('my-template (lowercase, hyphens)'), 'new-one')
    await userEvent.type(screen.getByPlaceholderText('What this template is for...'), 'd')
    await userEvent.type(screen.getByPlaceholderText('<task>...</task>'), 'c')
    await userEvent.click(screen.getByRole('button', { name: /Create/ }))

    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-template (lowercase, hyphens)')).toHaveValue('new-one')
  })

  it('loads a template into the form when it is clicked', async () => {
    mockApi(BASE)
    render(<Templates />, { wrapper: createWrapper() })
    await userEvent.click(await screen.findByText('review checklist'))

    expect(screen.getByPlaceholderText('<task>...</task>')).toHaveValue('<task>Review</task>')
  })

  it('closes the form from either cancel, without saving', async () => {
    // Two of them, at the head and the foot of the panel, so a long form can be
    // abandoned without scrolling to one end. Both have to work.
    for (const index of [0, 1]) {
      const spy = mockApi(BASE)
      const view = render(<Templates />, { wrapper: createWrapper() })
      await userEvent.click(await screen.findByText('review checklist'))

      const cancels = screen.getAllByRole('button', { name: 'Cancel' })
      expect(cancels).toHaveLength(2)
      await userEvent.click(cancels[index])

      expect(screen.queryByPlaceholderText('<task>...</task>')).not.toBeInTheDocument()
      expect(spy.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'PUT')).toBe(false)

      view.unmount()
      vi.restoreAllMocks()
    }
  })

  it('asks before deleting, and does nothing if the answer is no', async () => {
    const spy = mockApi(BASE)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(spy.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(false)
  })

  it('deletes when the answer is yes', async () => {
    const spy = mockApi({
      ...BASE,
      'DELETE /templates/': () => new Response(null, { status: 204 }),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    await waitFor(() =>
      expect(spy.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(true),
    )
  })

  it('does not open the editor when the delete button is clicked', async () => {
    // The row itself is clickable, so the delete has to stop the event or every
    // deletion also opens the thing being deleted.
    mockApi(BASE)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<Templates />, { wrapper: createWrapper() })
    await screen.findByText('review checklist')
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.queryByPlaceholderText('<task>...</task>')).not.toBeInTheDocument()
  })

  it('says it is loading rather than showing an empty library', async () => {
    mockApi({ 'GET /templates': () => json({ templates: TEMPLATES }) })
    render(<Templates />, { wrapper: createWrapper() })

    expect(screen.getByText('Loading templates...')).toBeInTheDocument()
  })
})
