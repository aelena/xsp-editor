import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ConstraintLibrary from './ConstraintLibrary.tsx'
import type { Constraint, ListConstraintsResponse } from '../api/constraints.ts'

function makeConstraint(overrides: Partial<Constraint> = {}): Constraint {
  return {
    id: 'MED-001',
    description: 'No medical diagnoses or treatment recommendations',
    severity: 'critical',
    category: 'safety',
    owner: 'compliance-team',
    status: 'active',
    xml_block: '<constraint id="MED-001" severity="critical">\n  Never provide medical diagnoses.\n</constraint>',
    usage_count: 12,
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-02-15T00:00:00Z',
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

function mockFetch(response: { constraints: ListConstraintsResponse['constraints'] }) {
  const fullResponse: ListConstraintsResponse = {
    ...response,
    total: response.constraints.length,
    page: 1,
    limit: 50,
  }
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(fullResponse),
  } as Response)
}

describe('ConstraintLibrary', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('shows loading state initially', () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    render(<ConstraintLibrary />, { wrapper: createWrapper() })
    expect(screen.getByText('Loading constraints...')).toBeInTheDocument()
  })

  it('renders a list of constraints', async () => {
    const constraints = [
      makeConstraint({ id: 'MED-001', severity: 'critical', category: 'safety', usage_count: 12 }),
      makeConstraint({ id: 'GEN-001', description: 'No fabricated information', severity: 'high', category: 'content', usage_count: 5 }),
    ]
    fetchSpy = mockFetch({ constraints })

    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    expect(screen.getByText('GEN-001')).toBeInTheDocument()
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
    // Category text appears both in the table and the filter dropdown
    const table = screen.getByRole('table')
    expect(within(table).getByText('safety')).toBeInTheDocument()
    expect(within(table).getByText('content')).toBeInTheDocument()
    expect(screen.getByText('12 prompts')).toBeInTheDocument()
    expect(screen.getByText('5 prompts')).toBeInTheDocument()
  })

  it('shows empty state when no constraints exist', async () => {
    fetchSpy = mockFetch({ constraints: [] })

    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.getByText('No constraints yet. Add your first constraint to get started.')).toBeInTheDocument()
  })

  it('shows error state on fetch failure', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' }),
    } as Response)

    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/Failed to load constraints/)).toBeInTheDocument()
  })

  it('filters constraints by search input', async () => {
    const constraints = [
      makeConstraint({ id: 'MED-001', description: 'No medical diagnoses' }),
      makeConstraint({ id: 'GEN-001', description: 'No fabricated information' }),
    ]
    fetchSpy = mockFetch({ constraints })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search constraints...')
    await user.type(searchInput, 'fabricated')

    expect(screen.queryByText('MED-001')).not.toBeInTheDocument()
    expect(screen.getByText('GEN-001')).toBeInTheDocument()
  })

  it('filters constraints by category', async () => {
    const constraints = [
      makeConstraint({ id: 'MED-001', category: 'safety' }),
      makeConstraint({ id: 'GEN-001', category: 'content' }),
    ]
    fetchSpy = mockFetch({ constraints })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    const categorySelect = screen.getByLabelText('Filter by category')
    await user.selectOptions(categorySelect, 'content')

    expect(screen.queryByText('MED-001')).not.toBeInTheDocument()
    expect(screen.getByText('GEN-001')).toBeInTheDocument()
  })

  it('shows filtered empty message when filters match nothing', async () => {
    const constraints = [makeConstraint({ id: 'MED-001' })]
    fetchSpy = mockFetch({ constraints })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search constraints...')
    await user.type(searchInput, 'nonexistent')

    expect(screen.getByText('No constraints match your filters.')).toBeInTheDocument()
  })

  it('opens create modal when clicking Add Constraint', async () => {
    fetchSpy = mockFetch({ constraints: [] })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Constraint')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Constraint'))

    expect(screen.getByTestId('constraint-form-modal')).toBeInTheDocument()
    expect(screen.getByText('Add New Constraint')).toBeInTheDocument()
    expect(screen.getByLabelText('Constraint ID')).not.toBeDisabled()
  })

  it('submits create form and calls POST API', async () => {
    fetchSpy = mockFetch({ constraints: [] })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Constraint')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Constraint'))

    await user.type(screen.getByLabelText('Constraint ID'), 'TEST-001')
    await user.type(screen.getByLabelText('Description'), 'Test constraint')
    await user.type(screen.getByLabelText('Owner'), 'test-team')
    await user.type(screen.getByLabelText('XML Block'), '<constraint>test</constraint>')

    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      const postCalls = fetchSpy.mock.calls.filter((call) => {
        const opts = call[1] as RequestInit | undefined
        return opts?.method === 'POST'
      })
      expect(postCalls.length).toBe(1)
      const body = JSON.parse(postCalls[0][1]?.body as string)
      expect(body.id).toBe('TEST-001')
      expect(body.description).toBe('Test constraint')
      expect(body.severity).toBe('medium')
      expect(body.category).toBe('content')
    })
  })

  it('opens edit modal with pre-filled data when clicking Edit', async () => {
    const constraints = [
      makeConstraint({ id: 'MED-001', description: 'No medical diagnoses', severity: 'critical' }),
    ]
    fetchSpy = mockFetch({ constraints })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Edit'))

    expect(screen.getByTestId('constraint-form-modal')).toBeInTheDocument()
    expect(screen.getByText('Edit Constraint: MED-001')).toBeInTheDocument()
    expect(screen.getByLabelText('Constraint ID')).toBeDisabled()
    expect(screen.getByLabelText('Constraint ID')).toHaveValue('MED-001')
    expect(screen.getByLabelText('Description')).toHaveValue('No medical diagnoses')
  })

  it('submits edit form and calls PUT API', async () => {
    const constraints = [
      makeConstraint({ id: 'MED-001', description: 'No medical diagnoses' }),
    ]
    fetchSpy = mockFetch({ constraints })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Edit'))

    const descInput = screen.getByLabelText('Description')
    await user.clear(descInput)
    await user.type(descInput, 'Updated description')

    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      const putCalls = fetchSpy.mock.calls.filter((call) => {
        const opts = call[1] as RequestInit | undefined
        return opts?.method === 'PUT'
      })
      expect(putCalls.length).toBe(1)
      expect(putCalls[0][0]).toContain('/constraints/MED-001')
      const body = JSON.parse(putCalls[0][1]?.body as string)
      expect(body.description).toBe('Updated description')
    })
  })

  it('calls DELETE API when clicking Delete', async () => {
    const constraints = [makeConstraint({ id: 'MED-001' })]
    fetchSpy = mockFetch({ constraints })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Delete'))

    await waitFor(() => {
      const deleteCalls = fetchSpy.mock.calls.filter((call) => {
        const opts = call[1] as RequestInit | undefined
        return opts?.method === 'DELETE'
      })
      expect(deleteCalls.length).toBe(1)
      expect(deleteCalls[0][0]).toContain('/constraints/MED-001')
    })
  })

  it('closes create modal on Cancel', async () => {
    fetchSpy = mockFetch({ constraints: [] })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Constraint')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Constraint'))
    expect(screen.getByTestId('constraint-form-modal')).toBeInTheDocument()

    await user.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('constraint-form-modal')).not.toBeInTheDocument()
  })

  it('displays all severity levels correctly', async () => {
    const constraints = [
      makeConstraint({ id: 'C-1', severity: 'critical' }),
      makeConstraint({ id: 'C-2', severity: 'high' }),
      makeConstraint({ id: 'C-3', severity: 'medium' }),
      makeConstraint({ id: 'C-4', severity: 'low' }),
    ]
    fetchSpy = mockFetch({ constraints })

    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('critical')).toBeInTheDocument()
    })
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
    expect(screen.getByText('low')).toBeInTheDocument()
  })

  it('displays singular "prompt" for usage count of 1', async () => {
    const constraints = [makeConstraint({ id: 'MED-001', usage_count: 1 })]
    fetchSpy = mockFetch({ constraints })

    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('1 prompt')).toBeInTheDocument()
    })
  })

  it('has a link back to prompts', async () => {
    fetchSpy = mockFetch({ constraints: [] })

    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Back to Prompts' })
      expect(link).toHaveAttribute('href', '/prompts')
    })
  })

  it('disables Save button when id or description is empty', async () => {
    fetchSpy = mockFetch({ constraints: [] })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Add Constraint')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Add Constraint'))

    const saveButton = screen.getByText('Save')
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText('Constraint ID'), 'TEST-001')
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText('Description'), 'test description')
    expect(saveButton).not.toBeDisabled()
  })

  it('shows status field in edit modal', async () => {
    const constraints = [makeConstraint({ id: 'MED-001', status: 'active' })]
    fetchSpy = mockFetch({ constraints })

    const user = userEvent.setup()
    render(<ConstraintLibrary />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('MED-001')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Edit'))

    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveValue('active')
  })
})
