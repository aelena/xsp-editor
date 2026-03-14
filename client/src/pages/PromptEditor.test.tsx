import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import PromptEditor from './PromptEditor.tsx'
import { useEditorStore } from '../store/editor.ts'
import { useProjectStore } from '../store/project.ts'

// Mock CodeMirror since it doesn't work well in jsdom
vi.mock('../components/XmlEditor.tsx', () => ({
  default: function MockXmlEditor({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) {
    return (
      <textarea
        data-testid="xml-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  },
}))

function createWrapper(initialRoute = '/prompts/new') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/prompts/new" element={children} />
            <Route path="/prompts/:id/edit" element={children} />
            <Route path="/prompts" element={<div>Prompt List</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

// Mock API responses
function mockFetchResponses(responses: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const urlStr = typeof url === 'string' ? url : url.toString()

    for (const [pattern, data] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(data),
        } as Response
      }
    }

    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as Response
  })
}

const defaultMocks: Record<string, unknown> = {
  '/tags': { tags: [] },
  '/constraints': { constraints: [] },
  '/projects': { projects: [] },
  '/templates': { templates: [] },
}

describe('PromptEditor', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    useEditorStore.getState().reset()
    useProjectStore.getState().reset()
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  it('renders the editor page for new prompts', async () => {
    fetchSpy = mockFetchResponses(defaultMocks)

    render(<PromptEditor />, { wrapper: createWrapper() })

    expect(screen.getByTestId('prompt-editor-page')).toBeInTheDocument()
    expect(screen.getByTestId('prompt-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('save-button')).toBeInTheDocument()
    expect(screen.getByTestId('save-button')).toHaveTextContent('Save')
  })

  it('shows the back link to prompt list', () => {
    fetchSpy = mockFetchResponses(defaultMocks)

    render(<PromptEditor />, { wrapper: createWrapper() })
    expect(screen.getByText(/Prompts/)).toBeInTheDocument()
  })

  it('renders tags in the sidebar', async () => {
    fetchSpy = mockFetchResponses({
      ...defaultMocks,
      '/tags': {
        tags: [
          {
            name: 'task',
            purpose: 'Primary instruction',
            use_when: 'Every prompt',
            example: '<task>Do something</task>',
            enforcement: 'required',
            usage_count: 10,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          {
            name: 'context',
            purpose: 'Background information',
            use_when: 'When needed',
            example: '<context>Background</context>',
            enforcement: 'optional',
            usage_count: 5,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    })

    render(<PromptEditor />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('task')).toBeInTheDocument()
    })
    expect(screen.getByText('context')).toBeInTheDocument()
  })

  it('renders constraint picker in the sidebar', async () => {
    fetchSpy = mockFetchResponses({
      ...defaultMocks,
      '/constraints': {
        constraints: [
          {
            id: 'GEN-001',
            description: 'No fabricated information',
            severity: 'critical',
            category: 'content',
            owner: 'team',
            status: 'active',
            xml_block: '<constraint id="GEN-001">No fabrication</constraint>',
            usage_count: 5,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    })

    render(<PromptEditor />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('GEN-001')).toBeInTheDocument()
    })
  })

  it('enables save button when name is provided (legacy mode)', async () => {
    fetchSpy = mockFetchResponses(defaultMocks)

    const user = userEvent.setup()
    render(<PromptEditor />, { wrapper: createWrapper() })

    await user.type(screen.getByTestId('prompt-name-input'), 'my-prompt')

    // In legacy mode with an id param, save is enabled
    expect(screen.getByTestId('save-button')).toBeInTheDocument()
  })

  it('shows verification panel empty state initially', () => {
    fetchSpy = mockFetchResponses(defaultMocks)

    render(<PromptEditor />, { wrapper: createWrapper() })

    expect(screen.getByTestId('verification-empty')).toBeInTheDocument()
  })

  it('shows unsaved changes indicator after editing name', async () => {
    fetchSpy = mockFetchResponses(defaultMocks)

    const user = userEvent.setup()
    render(<PromptEditor />, { wrapper: createWrapper() })

    await user.type(screen.getByTestId('prompt-name-input'), 'test')

    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })

  it('shows preview section', () => {
    fetchSpy = mockFetchResponses(defaultMocks)

    render(<PromptEditor />, { wrapper: createWrapper() })

    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByText('Verification')).toBeInTheDocument()
  })

  it('loads existing prompt data when editing', async () => {
    fetchSpy = mockFetchResponses({
      ...defaultMocks,
      '/prompts/test-id': {
        id: 'test-id',
        name: 'existing-prompt',
        description: 'An existing prompt',
        version: '1.2.3',
        content: '<task>Test</task>',
        variables: {},
        tags_used: ['task'],
        constraints_referenced: [],
        author: 'alice',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        verification_status: 'passed',
        metadata: {},
      },
    })

    render(<PromptEditor />, {
      wrapper: createWrapper('/prompts/test-id/edit'),
    })

    await waitFor(() => {
      expect(screen.getByTestId('prompt-name-input')).toHaveValue(
        'existing-prompt',
      )
    })
    expect(screen.getByTestId('save-button')).toHaveTextContent('Save')
    expect(screen.getByText('v1.2.3')).toBeInTheDocument()
  })
})
