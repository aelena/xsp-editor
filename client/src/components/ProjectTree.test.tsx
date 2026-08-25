import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ProjectTree } from './ProjectTree.tsx'
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
  type TreeNode,
} from '../api/membership.ts'

const ALPHA_ID = 'aaaaaaaa-0000-4000-8000-000000000001'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
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

function node(overrides: Partial<TreeNode> & { project: TreeNode['project'] }): TreeNode {
  return { prompts: [], templates: [], ...overrides }
}

function mockTree(tree: TreeNode[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ tree }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

afterEach(() => vi.restoreAllMocks())

const ALPHA = node({
  project: project(ALPHA_ID, 'Alpha'),
  prompts: [
    { id: 'p1', name: 'classify-intent', version: '1.2.0', verification_status: 'passed' },
  ],
  templates: [{ name: 'basic', category: 'general', is_builtin: true }],
})

describe('ProjectTree', () => {
  it('puts General first and Archive last', async () => {
    // General is where everything without a home lives, and Archive is the least
    // interesting thing in the list until the moment it is the only thing that
    // matters. Sorting them alphabetically among the rest buries both.
    mockTree([
      node({ project: project(ARCHIVE_PROJECT_ID, 'Archive', true) }),
      ALPHA,
      node({ project: project(GENERAL_PROJECT_ID, 'General', true) }),
    ])

    render(<ProjectTree />, { wrapper: createWrapper() })

    // The row buttons, in document order. The expanders share the same names
    // with a verb in front, so matching on the bare name keeps them out.
    await screen.findByRole('button', { name: 'General' })
    const wanted = ['General', 'Alpha', 'Archive']
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => !!label && wanted.includes(label))

    expect(names).toEqual(wanted)
  })

  it('hides an unexpanded project’s contents', async () => {
    mockTree([ALPHA])
    render(<ProjectTree />, { wrapper: createWrapper() })

    // Waiting for the project to arrive first, so this is not an assertion that
    // passes because the request is still in flight.
    expect(await screen.findByRole('button', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.queryByText('classify-intent')).not.toBeInTheDocument()
  })

  it('shows prompts and templates when expanded', async () => {
    mockTree([ALPHA])
    render(<ProjectTree />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByLabelText('Expand Alpha'))

    expect(screen.getByText('classify-intent')).toBeInTheDocument()
    expect(screen.getByText('basic')).toBeInTheDocument()
  })

  it('links a prompt straight to its editor', async () => {
    mockTree([ALPHA])
    render(<ProjectTree />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByLabelText('Expand Alpha'))

    expect(screen.getByText('classify-intent').closest('a')).toHaveAttribute(
      'href',
      '/prompts/p1/edit',
    )
  })

  it('counts prompts and templates together', async () => {
    mockTree([ALPHA])
    render(<ProjectTree />, { wrapper: createWrapper() })

    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('reports the selection to the caller', async () => {
    const onSelect = vi.fn()
    mockTree([ALPHA])
    render(<ProjectTree onSelect={onSelect} />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: 'Alpha' }))

    expect(onSelect).toHaveBeenCalledWith(ALPHA_ID)
  })

  it('offers no expander for an empty project', async () => {
    // A twisty that opens onto nothing is a promise the tree cannot keep.
    mockTree([node({ project: project(ALPHA_ID, 'Alpha') })])
    render(<ProjectTree />, { wrapper: createWrapper() })

    // The marker is a dot rather than a plus, and clicking it opens nothing.
    expect(await screen.findByText('\u00b7')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Expand Alpha'))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
