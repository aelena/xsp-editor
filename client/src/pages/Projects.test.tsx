import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Projects } from './Projects.tsx'
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
  type TreeNode,
} from '../api/membership.ts'

const ALPHA = 'aaaaaaaa-0000-4000-8000-000000000001'

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

function project(id: string, name: string, is_reserved = false) {
  return {
    id,
    name,
    path: null,
    is_git_repo: false,
    is_reserved,
    created_at: '',
    updated_at: '',
  }
}

const TREE: TreeNode[] = [
  {
    project: project(GENERAL_PROJECT_ID, 'General', true),
    prompts: [{ id: 'p1', name: 'classify-intent', version: '1.2.0', verification_status: 'passed' }],
    templates: [{ name: 'basic', category: 'general', is_builtin: true }],
  },
  {
    project: project(ALPHA, 'Alpha'),
    prompts: [{ id: 'p2', name: 'extract-entities', version: '2.0.0', verification_status: 'passed' }],
    templates: [],
  },
  { project: project(ARCHIVE_PROJECT_ID, 'Archive', true), prompts: [], templates: [] },
]

/** Routes by method and path so a test describes answers, not call order. */
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

const BASE = {
  'GET /projects/tree': () => json({ tree: TREE }),
  'GET /projects': () => json({ projects: TREE.map((n) => n.project) }),
}

afterEach(() => vi.restoreAllMocks())

describe('Projects', () => {
  it('opens on General, which is where everything without a home lives', async () => {
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument()
  })

  it('shows the selected project’s prompts and templates in the panel', async () => {
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })
    const heading = await screen.findByRole('heading', { name: 'General' })

    const panel = within(heading.closest('section') as HTMLElement)
    expect(panel.getByRole('link', { name: 'classify-intent' })).toBeInTheDocument()
    expect(panel.getByText('built-in')).toBeInTheDocument()
  })

  it('shows the same prompt in the tree and in the panel', async () => {
    // Not a duplicate to be deduplicated. The two answer different questions:
    // the tree says where something lives, the panel says what is in here.
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })

    expect(screen.getAllByRole('link', { name: 'classify-intent' })).toHaveLength(2)
  })

  it('switches to another project from the tree', async () => {
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })

    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }))

    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'extract-entities' })).toBeInTheDocument()
  })

  it('says a project has no folder rather than leaving the line blank', async () => {
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })

    expect(screen.getByText('No folder on disk')).toBeInTheDocument()
  })

  it('offers no delete for a reserved project', async () => {
    // General and Archive are part of the model. A button that always answers
    // 409 is a button that should not be there.
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })

    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(await screen.findByRole('button', { name: 'Delete project' })).toBeInTheDocument()
  })

  it('creates a project', async () => {
    const created: string[] = []
    mockApi({
      ...BASE,
      'POST /projects': (init) => {
        created.push(String(init?.body))
        return json(project('new', 'Serrin'), 201)
      },
    })

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })

    await userEvent.type(screen.getByLabelText('New project name'), 'Serrin')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(JSON.parse(created[0])).toEqual({ name: 'Serrin' })
  })

  it('does not send a path when creating from here', async () => {
    // A project made on this page is a grouping. Pointing one at a folder
    // happens where browsing for it makes sense.
    const created: string[] = []
    mockApi({
      ...BASE,
      'POST /projects': (init) => {
        created.push(String(init?.body))
        return json(project('new', 'Serrin'), 201)
      },
    })

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.type(screen.getByLabelText('New project name'), 'Serrin')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).not.toContain('path')
  })

  it('shows the server error when a name is taken', async () => {
    mockApi({
      ...BASE,
      'POST /projects': () => json({ error: 'A project with that name exists' }, 409),
    })

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.type(screen.getByLabelText('New project name'), 'General')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('A project with that name exists')).toBeInTheDocument()
  })

  it('will not submit an empty name', async () => {
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('asks what to do with the items a deletion would orphan', async () => {
    // The 409 is the server declining to choose, not a failure, and the count
    // is what makes the question answerable.
    mockApi({
      ...BASE,
      'DELETE /projects/': () => json({ orphan_count: 4 }, 409),
      'GET /projects/aaaaaaaa-0000-4000-8000-000000000001/orphan-count': () =>
        json({ orphan_count: 4, member_count: 9 }),
    })

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }))

    expect(await screen.findByText(/leaves/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive them' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move them to General' })).toBeInTheDocument()
  })

  it('says plainly that items with another project are unaffected', async () => {
    // The rule that made the two halves of the brief consistent. If the dialog
    // does not say it, the user assumes the worst and cancels.
    mockApi({
      ...BASE,
      'DELETE /projects/': () => json({ orphan_count: 4 }, 409),
      'GET /projects/aaaaaaaa-0000-4000-8000-000000000001/orphan-count': () =>
        json({ orphan_count: 4, member_count: 9 }),
    })

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }))

    expect(await screen.findByText(/not affected either way/i)).toBeInTheDocument()
  })

  it('sends the answer the user chose', async () => {
    const deletes: string[] = []
    mockApi({
      ...BASE,
      'DELETE /projects/': (init) => {
        void init
        deletes.push('call')
        return deletes.length === 1 ? json({ orphan_count: 4 }, 409) : new Response(null, { status: 204 })
      },
      'GET /projects/aaaaaaaa-0000-4000-8000-000000000001/orphan-count': () =>
        json({ orphan_count: 4, member_count: 9 }),
    })
    const spy = vi.spyOn(globalThis, 'fetch')

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Archive them' }))

    await waitFor(() => expect(deletes).toHaveLength(2))
    const urls = spy.mock.calls
      .filter((c) => (c[1] as RequestInit)?.method === 'DELETE')
      .map((c) => String(c[0]))
    expect(urls[0]).not.toContain('orphans=')
    expect(urls[1]).toContain('orphans=archive')
  })

  it('lets the user back out of the deletion', async () => {
    mockApi({
      ...BASE,
      'DELETE /projects/': () => json({ orphan_count: 4 }, 409),
      'GET /projects/aaaaaaaa-0000-4000-8000-000000000001/orphan-count': () =>
        json({ orphan_count: 4, member_count: 9 }),
    })

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('button', { name: 'Archive them' })).not.toBeInTheDocument()
  })

  it('reports a real failure as an error rather than as a question', async () => {
    mockApi({
      ...BASE,
      'DELETE /projects/': () => json({ error: 'Storage exploded' }, 500),
    })

    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }))

    expect(await screen.findByText('Storage exploded')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive them' })).not.toBeInTheDocument()
  })

  it('says a project is empty rather than showing nothing', async () => {
    mockApi(BASE)
    render(<Projects />, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'General' })
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))

    expect((await screen.findAllByText('None yet.')).length).toBe(2)
  })
})
