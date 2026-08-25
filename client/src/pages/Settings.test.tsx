import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import Settings from './Settings.tsx'
import type { LLMConfig } from '../api/llm.ts'

function makeConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    api_key_set: true,
    default_max_tokens: 4096,
    default_temperature: 0.7,
    custom_base_url: null,
    ...overrides,
  }
}

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

function mockConfig(config: LLMConfig) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(config), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

function mockConfigFailure() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: 'nope' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Settings', () => {
  it('shows the saved configuration once it has loaded', async () => {
    mockConfig(makeConfig())

    render(<Settings />, { wrapper: createWrapper() })

    // Every field comes from the response, not from the component's defaults.
    // This is the behaviour a reader of this component most needs to trust, and
    // the reason the test exists: the values used to arrive through an effect
    // that copied server state into local state after the first render.
    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('gpt-4o-mini')).toBeInTheDocument()
    expect(screen.getByDisplayValue('4096')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0.7')).toBeInTheDocument()
  })

  it('falls back to anthropic when the saved provider is null', async () => {
    mockConfig(makeConfig({ provider: null, model: null }))

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Anthropic')).toBeInTheDocument()
    })
  })

  it('clears the model when the provider changes', async () => {
    const user = userEvent.setup()
    mockConfig(makeConfig())

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByDisplayValue('gpt-4o-mini')).toBeInTheDocument()
    })

    // A model belongs to a provider, so keeping gpt-4o-mini selected after
    // switching to Anthropic would offer to save an impossible pair.
    const providerSelect = screen.getByDisplayValue('OpenAI')
    await user.selectOptions(providerSelect, 'anthropic')

    await waitFor(() => {
      expect(screen.queryByDisplayValue('gpt-4o-mini')).not.toBeInTheDocument()
    })
  })

  it('shows the base URL field only for providers that need one', async () => {
    const user = userEvent.setup()
    mockConfig(makeConfig())

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument()
    })
    expect(screen.queryByText('Base URL')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByDisplayValue('OpenAI'), 'custom')

    await waitFor(() => {
      expect(screen.getByText('Base URL')).toBeInTheDocument()
    })
  })

  it('will not offer to test a connection with no key stored', async () => {
    mockConfig(makeConfig({ api_key_set: false }))

    render(<Settings />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Test Connection' }),
      ).toBeDisabled()
    })
  })

  it('says so when the configuration cannot be loaded', async () => {
    mockConfigFailure()

    render(<Settings />, { wrapper: createWrapper() })

    // The form used to render regardless, showing its own defaults where the
    // saved values should be. Presenting "anthropic" and an empty model as
    // though they were the stored settings is worse than an error: the reader
    // has no way to tell the difference, and saving would overwrite whatever is
    // really on the server.
    // Wait for a positive signal first. Asserting only that the form is
    // absent would also pass while the request is still in flight, which is a
    // test that can never fail.
    await waitFor(() => {
      expect(screen.getByText(/could not load/i)).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: 'Save Configuration' }),
    ).not.toBeInTheDocument()
  })
})
