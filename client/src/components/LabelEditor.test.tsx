import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { LabelEditor } from './LabelEditor.tsx'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

const BASE = {
  'GET /prompts/p1/labels': () => json({ labels: ['draft'] }),
  'GET /labels': () =>
    json({
      labels: [
        { label: 'nlp', count: 3, prompts: 3, templates: 0 },
        { label: 'draft', count: 1, prompts: 1, templates: 0 },
      ],
    }),
}

const renderEditor = () =>
  render(<LabelEditor kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

afterEach(() => vi.restoreAllMocks())

describe('LabelEditor', () => {
  it('shows the labels already on the artifact', async () => {
    mockApi(BASE)
    renderEditor()
    expect(await screen.findByText('draft')).toBeInTheDocument()
  })

  it('adds one on Enter', async () => {
    const saved: string[] = []
    mockApi({
      ...BASE,
      'PUT /prompts/p1/labels': (init) => {
        saved.push(String(init?.body))
        return json({ labels: ['draft', 'urgent'] })
      },
    })
    renderEditor()
    await screen.findByText('draft')

    await userEvent.type(screen.getByLabelText('Add a label'), 'urgent{Enter}')

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(JSON.parse(saved[0]).labels).toEqual(['draft', 'urgent'])
  })

  it('adds one on a comma too', async () => {
    // People type both, and being told which separator this field prefers is
    // not worth anyone's attention.
    const saved: string[] = []
    mockApi({
      ...BASE,
      'PUT /prompts/p1/labels': (init) => {
        saved.push(String(init?.body))
        return json({ labels: ['draft', 'urgent'] })
      },
    })
    renderEditor()
    await screen.findByText('draft')

    await userEvent.type(screen.getByLabelText('Add a label'), 'urgent,')

    await waitFor(() => expect(saved).toHaveLength(1))
  })

  it('ignores a label the artifact already has, whatever the case', async () => {
    // Otherwise the chip appears to be added and then vanishes on reload,
    // because the server deduplicates case-insensitively.
    const spy = mockApi(BASE)
    renderEditor()
    await screen.findByText('draft')

    await userEvent.type(screen.getByLabelText('Add a label'), 'DRAFT{Enter}')

    expect(spy.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'PUT')).toBe(false)
  })

  it('ignores an empty entry', async () => {
    const spy = mockApi(BASE)
    renderEditor()
    await screen.findByText('draft')

    await userEvent.type(screen.getByLabelText('Add a label'), '   {Enter}')

    expect(spy.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'PUT')).toBe(false)
  })

  it('removes one', async () => {
    const saved: string[] = []
    mockApi({
      ...BASE,
      'PUT /prompts/p1/labels': (init) => {
        saved.push(String(init?.body))
        return json({ labels: [] })
      },
    })
    renderEditor()
    await screen.findByText('draft')

    await userEvent.click(screen.getByLabelText('Remove label draft'))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(JSON.parse(saved[0]).labels).toEqual([])
  })

  it('suggests labels already in use elsewhere', async () => {
    // The whole reason drift happens is that nobody can see what exists at the
    // moment they are typing. Showing them is cheaper than cleaning up later.
    mockApi(BASE)
    renderEditor()
    await screen.findByText('draft')

    expect(await screen.findByRole('button', { name: 'nlp' })).toBeInTheDocument()
  })

  it('does not suggest one the artifact already carries', async () => {
    mockApi(BASE)
    renderEditor()
    await screen.findByText('draft')

    expect(screen.queryByRole('button', { name: 'draft' })).not.toBeInTheDocument()
  })

  it('narrows the suggestions as you type', async () => {
    mockApi(BASE)
    renderEditor()
    await screen.findByText('draft')
    await screen.findByRole('button', { name: 'nlp' })

    await userEvent.type(screen.getByLabelText('Add a label'), 'zz')

    expect(screen.queryByRole('button', { name: 'nlp' })).not.toBeInTheDocument()
  })

  it('adds a suggestion when it is clicked', async () => {
    const saved: string[] = []
    mockApi({
      ...BASE,
      'PUT /prompts/p1/labels': (init) => {
        saved.push(String(init?.body))
        return json({ labels: ['draft', 'nlp'] })
      },
    })
    renderEditor()
    await userEvent.click(await screen.findByRole('button', { name: 'nlp' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(JSON.parse(saved[0]).labels).toEqual(['draft', 'nlp'])
  })

  it('reports a failure to save', async () => {
    mockApi({
      ...BASE,
      'PUT /prompts/p1/labels': () => json({ error: 'Storage exploded' }, 500),
    })
    renderEditor()
    await screen.findByText('draft')

    await userEvent.type(screen.getByLabelText('Add a label'), 'urgent{Enter}')

    expect(await screen.findByText('Storage exploded')).toBeInTheDocument()
  })
})
