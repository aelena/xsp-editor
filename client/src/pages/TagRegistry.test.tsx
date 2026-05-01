import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import TagRegistry from './TagRegistry.tsx'
import type { Tag, ListTagsResponse } from '../api/tags.ts'

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    name: 'task',
    purpose: 'Primary instruction — what the model should do',
    use_when: 'Every prompt',
    example: '<task>Summarize the document</task>',
    enforcement: 'required',
    usage_count: 47,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
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

function mockFetch(response: { tags: ListTagsResponse['tags'] }) {
  const fullResponse: ListTagsResponse = {
    ...response,
    total: response.tags.length,
    page: 1,
    limit: 50,
  }
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(fullResponse),
  } as Response)
}

describe('TagRegistry', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('shows loading state initially', () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    render(<TagRegistry />, { wrapper: createWrapper() })
    expect(screen.getByText('Loading tags...')).toBeInTheDocument()
  })

  it('renders a list of tags', async () => {
    const tags = [
      makeTag({ name: 'task', enforcement: 'required', usage_count: 47 }),
      makeTag({ name: 'context', purpose: 'Background information', enforcement: 'optional', usage_count: 12 }),
    ]
    fetchSpy = mockFetch({ tags })

    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('<task>')).toBeInTheDocument()
    })

    expect(screen.getByText('<context>')).toBeInTheDocument()
    expect(screen.getByText('required')).toBeInTheDocument()
    expect(screen.getByText('optional')).toBeInTheDocument()
    expect(screen.getByText('47 prompts')).toBeInTheDocument()
    expect(screen.getByText('12 prompts')).toBeInTheDocument()
  })

  it('shows empty state when no tags exist', async () => {
    fetchSpy = mockFetch({ tags: [] })

    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.getByText('No tags yet. Add your first tag to get started.')).toBeInTheDocument()
  })

  it('shows error state on fetch failure', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    } as Response)

    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/Failed to load tags/)).toBeInTheDocument()
  })

  it('filters tags by search input', async () => {
    const tags = [
      makeTag({ name: 'task', purpose: 'Primary instruction' }),
      makeTag({ name: 'context', purpose: 'Background information' }),
    ]
    fetchSpy = mockFetch({ tags })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('<task>')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search tags...')
    await user.type(searchInput, 'context')

    expect(screen.queryByText('<task>')).not.toBeInTheDocument()
    expect(screen.getByText('<context>')).toBeInTheDocument()
  })

  it('shows empty search results message', async () => {
    const tags = [makeTag({ name: 'task' })]
    fetchSpy = mockFetch({ tags })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('<task>')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search tags...')
    await user.type(searchInput, 'nonexistent')

    expect(screen.getByText('No tags match your search.')).toBeInTheDocument()
  })

  it('opens create modal when clicking Add Tag', async () => {
    fetchSpy = mockFetch({ tags: [] })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Tag')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Tag'))

    expect(screen.getByTestId('tag-form-modal')).toBeInTheDocument()
    expect(screen.getByText('Add New Tag')).toBeInTheDocument()
    expect(screen.getByLabelText('Tag Name')).not.toBeDisabled()
  })

  it('submits create form and calls POST API', async () => {
    fetchSpy = mockFetch({ tags: [] })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Tag')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Tag'))

    await user.type(screen.getByLabelText('Tag Name'), 'examples')
    await user.type(screen.getByLabelText('Purpose'), 'Few-shot demonstrations')
    await user.type(screen.getByLabelText('Use When'), 'Need to show examples')
    await user.type(screen.getByLabelText('Example'), '<examples>...</examples>')

    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      const postCalls = fetchSpy.mock.calls.filter((call) => {
        const opts = call[1] as RequestInit | undefined
        return opts?.method === 'POST'
      })
      expect(postCalls.length).toBe(1)
      const body = JSON.parse(postCalls[0][1]?.body as string)
      expect(body.name).toBe('examples')
      expect(body.purpose).toBe('Few-shot demonstrations')
      expect(body.enforcement).toBe('optional')
    })
  })

  it('opens edit modal with pre-filled data when clicking Edit', async () => {
    const tags = [
      makeTag({ name: 'task', purpose: 'Primary instruction', enforcement: 'required' }),
    ]
    fetchSpy = mockFetch({ tags })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('<task>')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Edit'))

    expect(screen.getByTestId('tag-form-modal')).toBeInTheDocument()
    expect(screen.getByText('Edit Tag: task')).toBeInTheDocument()
    expect(screen.getByLabelText('Tag Name')).toBeDisabled()
    expect(screen.getByLabelText('Tag Name')).toHaveValue('task')
    expect(screen.getByLabelText('Purpose')).toHaveValue('Primary instruction')
  })

  it('submits edit form and calls PUT API', async () => {
    const tags = [
      makeTag({ name: 'task', purpose: 'Primary instruction', enforcement: 'required' }),
    ]
    fetchSpy = mockFetch({ tags })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('<task>')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Edit'))

    const purposeInput = screen.getByLabelText('Purpose')
    await user.clear(purposeInput)
    await user.type(purposeInput, 'Updated purpose')

    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      const putCalls = fetchSpy.mock.calls.filter((call) => {
        const opts = call[1] as RequestInit | undefined
        return opts?.method === 'PUT'
      })
      expect(putCalls.length).toBe(1)
      expect(putCalls[0][0]).toContain('/tags/task')
      const body = JSON.parse(putCalls[0][1]?.body as string)
      expect(body.purpose).toBe('Updated purpose')
    })
  })

  it('calls DELETE API when clicking Delete', async () => {
    const tags = [makeTag({ name: 'task' })]
    fetchSpy = mockFetch({ tags })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('<task>')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Delete'))

    await waitFor(() => {
      const deleteCalls = fetchSpy.mock.calls.filter((call) => {
        const opts = call[1] as RequestInit | undefined
        return opts?.method === 'DELETE'
      })
      expect(deleteCalls.length).toBe(1)
      expect(deleteCalls[0][0]).toContain('/tags/task')
    })
  })

  it('closes create modal on Cancel', async () => {
    fetchSpy = mockFetch({ tags: [] })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Tag')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Tag'))
    expect(screen.getByTestId('tag-form-modal')).toBeInTheDocument()

    await user.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('tag-form-modal')).not.toBeInTheDocument()
  })

  it('displays all enforcement levels correctly', async () => {
    const tags = [
      makeTag({ name: 'task', enforcement: 'required' }),
      makeTag({ name: 'context', enforcement: 'recommended' }),
      makeTag({ name: 'examples', enforcement: 'optional' }),
      makeTag({ name: 'old-tag', enforcement: 'deprecated' }),
    ]
    fetchSpy = mockFetch({ tags })

    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('required')).toBeInTheDocument()
    })
    expect(screen.getByText('recommended')).toBeInTheDocument()
    // 'optional' appears both as enforcement badge and in the form default,
    // so we check within the table
    const table = screen.getByRole('table')
    expect(within(table).getByText('optional')).toBeInTheDocument()
    expect(screen.getByText('deprecated')).toBeInTheDocument()
  })

  it('displays singular "prompt" for usage count of 1', async () => {
    const tags = [makeTag({ name: 'task', usage_count: 1 })]
    fetchSpy = mockFetch({ tags })

    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('1 prompt')).toBeInTheDocument()
    })
  })

  it('has a link back to prompts', async () => {
    fetchSpy = mockFetch({ tags: [] })

    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Back to Prompts' })
      expect(link).toHaveAttribute('href', '/prompts')
    })
  })

  it('disables Save button when name or purpose is empty', async () => {
    fetchSpy = mockFetch({ tags: [] })

    const user = userEvent.setup()
    render(<TagRegistry />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Tag')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Tag'))

    const saveButton = screen.getByText('Save')
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText('Tag Name'), 'test')
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText('Purpose'), 'test purpose')
    expect(saveButton).not.toBeDisabled()
  })
})
