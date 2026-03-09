import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import PromptList from './PromptList.tsx'
import type { Prompt, ListPromptsResponse } from '../api/prompts.ts'

function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: 'test-id-1',
    name: 'classify-intent',
    description: 'Classifies customer messages into support categories',
    version: '2.3.1',
    content: '<task>Classify</task>',
    variables: {},
    tags_used: ['task'],
    constraints_referenced: [],
    author: 'alice',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-03-01T14:30:00Z',
    verification_status: 'passed',
    metadata: {},
    ...overrides,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function mockFetch(response: ListPromptsResponse) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(response),
  } as Response)
}

describe('PromptList', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('shows loading state initially', () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    render(<PromptList />, { wrapper: createWrapper() })
    expect(screen.getByText('Loading prompts...')).toBeInTheDocument()
  })

  it('renders a list of prompts', async () => {
    const prompts = [
      makePrompt({ id: '1', name: 'classify-intent', author: 'alice', version: '2.3.1', verification_status: 'passed' }),
      makePrompt({ id: '2', name: 'extract-entities', author: 'bob', version: '1.0.0', verification_status: 'warnings', description: 'Extracts named entities' }),
    ]
    fetchSpy = mockFetch({ prompts, total: 2, page: 1, limit: 20 })

    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('classify-intent')).toBeInTheDocument()
    })

    expect(screen.getByText('extract-entities')).toBeInTheDocument()
    expect(screen.getByText('v2.3.1')).toBeInTheDocument()
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText('Warnings')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('shows empty state when no prompts exist', async () => {
    fetchSpy = mockFetch({ prompts: [], total: 0, page: 1, limit: 20 })

    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.getByText('No prompts yet. Create your first prompt to get started.')).toBeInTheDocument()
  })

  it('shows empty search result message', async () => {
    fetchSpy = mockFetch({ prompts: [], total: 0, page: 1, limit: 20 })

    const user = userEvent.setup()
    render(<PromptList />, { wrapper: createWrapper() })

    const searchInput = screen.getByPlaceholderText('Search prompts...')
    await user.type(searchInput, 'nonexistent')

    await waitFor(() => {
      expect(screen.getByText('No prompts match your search.')).toBeInTheDocument()
    })
  })

  it('shows error state on fetch failure', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    } as Response)

    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/Failed to load prompts/)).toBeInTheDocument()
  })

  it('sends search query parameter when searching', async () => {
    fetchSpy = mockFetch({ prompts: [], total: 0, page: 1, limit: 20 })

    const user = userEvent.setup()
    render(<PromptList />, { wrapper: createWrapper() })

    const searchInput = screen.getByPlaceholderText('Search prompts...')
    await user.type(searchInput, 'classify')

    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]
      expect(lastCall[0]).toContain('search=classify')
    })
  })

  it('shows pagination controls when there are multiple pages', async () => {
    const prompts = Array.from({ length: 20 }, (_, i) =>
      makePrompt({ id: `id-${i}`, name: `prompt-${i}` }),
    )
    fetchSpy = mockFetch({ prompts, total: 45, page: 1, limit: 20 })

    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3 (45 total)')).toBeInTheDocument()
    })

    expect(screen.getByText('Previous')).toBeDisabled()
    expect(screen.getByText('Next')).not.toBeDisabled()
  })

  it('navigates to next page when clicking Next', async () => {
    const prompts = Array.from({ length: 20 }, (_, i) =>
      makePrompt({ id: `id-${i}`, name: `prompt-${i}` }),
    )
    fetchSpy = mockFetch({ prompts, total: 45, page: 1, limit: 20 })

    const user = userEvent.setup()
    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Next'))

    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]
      expect(lastCall[0]).toContain('page=2')
    })
  })

  it('displays all verification statuses correctly', async () => {
    const prompts = [
      makePrompt({ id: '1', name: 'p1', verification_status: 'passed' }),
      makePrompt({ id: '2', name: 'p2', verification_status: 'warnings' }),
      makePrompt({ id: '3', name: 'p3', verification_status: 'failed' }),
      makePrompt({ id: '4', name: 'p4', verification_status: 'unchecked' }),
    ]
    fetchSpy = mockFetch({ prompts, total: 4, page: 1, limit: 20 })

    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Verified')).toBeInTheDocument()
    })
    expect(screen.getByText('Warnings')).toBeInTheDocument()
    expect(screen.getByText('Errors')).toBeInTheDocument()
    expect(screen.getByText('Unchecked')).toBeInTheDocument()
  })

  it('does not show pagination for a single page', async () => {
    const prompts = [makePrompt()]
    fetchSpy = mockFetch({ prompts, total: 1, page: 1, limit: 20 })

    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('classify-intent')).toBeInTheDocument()
    })

    expect(screen.queryByText('Previous')).not.toBeInTheDocument()
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
  })

  it('sends author filter parameter', async () => {
    fetchSpy = mockFetch({ prompts: [], total: 0, page: 1, limit: 20 })

    const user = userEvent.setup()
    render(<PromptList />, { wrapper: createWrapper() })

    const authorInput = screen.getByPlaceholderText('Filter by author...')
    await user.type(authorInput, 'alice')

    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]
      expect(lastCall[0]).toContain('author=alice')
    })
  })

  it('sends tag filter parameter', async () => {
    fetchSpy = mockFetch({ prompts: [], total: 0, page: 1, limit: 20 })

    const user = userEvent.setup()
    render(<PromptList />, { wrapper: createWrapper() })

    const tagInput = screen.getByPlaceholderText('Filter by tag...')
    await user.type(tagInput, 'task')

    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]
      expect(lastCall[0]).toContain('tag=task')
    })
  })

  it('renders quick action links for each prompt', async () => {
    const prompts = [
      makePrompt({ id: 'abc-123', name: 'test-prompt' }),
    ]
    fetchSpy = mockFetch({ prompts, total: 1, page: 1, limit: 20 })

    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('test-prompt')).toBeInTheDocument()
    })

    const editLink = screen.getByRole('link', { name: 'Edit' })
    expect(editLink).toHaveAttribute('href', '/prompts/abc-123/edit')

    const changelogLink = screen.getByRole('link', { name: 'Changelog' })
    expect(changelogLink).toHaveAttribute('href', '/prompts/abc-123/versions')

    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument()
  })

  it('calls create API when clicking Duplicate', async () => {
    const prompt = makePrompt({ id: 'abc-123', name: 'my-prompt', description: 'A prompt', content: '<task>Do it</task>' })
    fetchSpy = mockFetch({ prompts: [prompt], total: 1, page: 1, limit: 20 })

    const user = userEvent.setup()
    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('my-prompt')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => {
      const postCalls = fetchSpy.mock.calls.filter(
        (call) => {
          const opts = call[1] as RequestInit | undefined
          return opts?.method === 'POST'
        },
      )
      expect(postCalls.length).toBe(1)
      const body = JSON.parse(postCalls[0][1]?.body as string)
      expect(body.name).toBe('my-prompt-copy')
      expect(body.content).toBe('<task>Do it</task>')
    })
  })

  it('resets page to 1 when author filter changes', async () => {
    const prompts = Array.from({ length: 20 }, (_, i) =>
      makePrompt({ id: `id-${i}`, name: `prompt-${i}` }),
    )
    fetchSpy = mockFetch({ prompts, total: 45, page: 1, limit: 20 })

    const user = userEvent.setup()
    render(<PromptList />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Next')).toBeInTheDocument()
    })

    // Go to page 2
    await user.click(screen.getByText('Next'))
    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]
      expect(lastCall[0]).toContain('page=2')
    })

    // Type in author filter - should reset to page 1
    const authorInput = screen.getByPlaceholderText('Filter by author...')
    await user.type(authorInput, 'b')

    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]
      expect(lastCall[0]).toContain('page=1')
      expect(lastCall[0]).toContain('author=b')
    })
  })
})
