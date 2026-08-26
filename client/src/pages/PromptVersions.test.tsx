import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import PromptVersions from './PromptVersions.tsx'

const ID = '11111111-0000-4000-8000-000000000001'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/prompts/${ID}/versions`]}>
          <Routes>
            <Route path="/prompts/:id/versions" element={children} />
          </Routes>
        </MemoryRouter>
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

function mockApi(handlers: Record<string, () => Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    // Longest path first, so /versions is not swallowed by the prompt route.
    for (const [path, handler] of Object.entries(handlers).sort(
      (a, b) => b[0].length - a[0].length,
    )) {
      if (url.includes(path)) return Promise.resolve(handler())
    }
    return Promise.resolve(json({ error: `unhandled ${url}` }, 500))
  })
}

const PROMPT = { id: ID, name: 'classify-intent', version: '1.2.0' }
const VERSIONS = {
  versions: [
    {
      prompt_id: ID,
      version: '1.0.0',
      content: '<task>a</task>',
      author: 'antonio',
      changelog_summary: 'Initial version',
      version_bump_type: 'major',
      created_at: '2026-01-15T10:00:00.000Z',
    },
    {
      prompt_id: ID,
      version: '1.2.0',
      content: '<task>b</task>',
      author: 'bea',
      changelog_summary: 'Tightened the output contract',
      version_bump_type: 'minor',
      created_at: '2026-02-20T10:00:00.000Z',
    },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe('PromptVersions', () => {
  it('says it is loading rather than showing an empty changelog', () => {
    mockApi({ [`/prompts/${ID}/versions`]: () => json(VERSIONS), [`/prompts/${ID}`]: () => json(PROMPT) })
    render(<PromptVersions />, { wrapper: createWrapper() })

    expect(screen.getByRole('status')).toHaveTextContent('Loading changelog...')
  })

  it('lists every version with its author and summary', async () => {
    mockApi({ [`/prompts/${ID}/versions`]: () => json(VERSIONS), [`/prompts/${ID}`]: () => json(PROMPT) })
    render(<PromptVersions />, { wrapper: createWrapper() })

    expect(await screen.findByText('Tightened the output contract')).toBeInTheDocument()
    expect(screen.getByText('Initial version')).toBeInTheDocument()
    expect(screen.getByText('antonio')).toBeInTheDocument()
    expect(screen.getByText('bea')).toBeInTheDocument()
  })

  it('distinguishes no history from a failure to load one', async () => {
    // An empty changelog means nobody has saved a change yet, and the page says
    // how one gets created. A failure means try again. Showing the same screen
    // for both sends people looking for a problem that is not there.
    mockApi({ [`/prompts/${ID}/versions`]: () => json({ versions: [] }), [`/prompts/${ID}`]: () => json(PROMPT) })
    render(<PromptVersions />, { wrapper: createWrapper() })

    expect(await screen.findByText('There is no changelog for this template.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a prompt that is not there as an error', async () => {
    mockApi({
      [`/prompts/${ID}/versions`]: () => json(VERSIONS),
      [`/prompts/${ID}`]: () => json({ error: 'Prompt not found' }, 404),
    })
    render(<PromptVersions />, { wrapper: createWrapper() })

    expect(await screen.findByRole('alert')).toHaveTextContent('Prompt not found')
  })

  it('reports a versions request that failed', async () => {
    mockApi({
      [`/prompts/${ID}/versions`]: () => json({ error: 'boom' }, 500),
      [`/prompts/${ID}`]: () => json(PROMPT),
    })
    render(<PromptVersions />, { wrapper: createWrapper() })

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load versions')
  })

  it('compares the two most recent versions by default', async () => {
    // The common case, so it should not need two clicks before showing anything.
    mockApi({ [`/prompts/${ID}/versions`]: () => json(VERSIONS), [`/prompts/${ID}`]: () => json(PROMPT) })
    render(<PromptVersions />, { wrapper: createWrapper() })

    await screen.findByText('Tightened the output contract')
    expect(screen.getByText(/v1\.0\.0.*v1\.2\.0/)).toBeInTheDocument()
    expect(screen.getByText('<task>a</task>')).toBeInTheDocument()
    expect(screen.getByText('<task>b</task>')).toBeInTheDocument()
  })

  it('lets either side be chosen, because the interesting pair is rarely adjacent', async () => {
    // "What changed between what is in production and what I am about to ship"
    // is the real question, and those two are usually not next to each other.
    mockApi({ [`/prompts/${ID}/versions`]: () => json(VERSIONS), [`/prompts/${ID}`]: () => json(PROMPT) })
    render(<PromptVersions />, { wrapper: createWrapper() })
    await screen.findByText('Tightened the output contract')

    expect(screen.getByRole('combobox', { name: /From/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /To/ })).toBeInTheDocument()
  })

  it('offers no comparison when there is only one version', async () => {
    // Nothing to compare it against, and two identical dropdowns would invite
    // the reader to try.
    mockApi({
      [`/prompts/${ID}/versions`]: () => json({ versions: [VERSIONS.versions[0]] }),
      [`/prompts/${ID}`]: () => json(PROMPT),
    })
    render(<PromptVersions />, { wrapper: createWrapper() })

    await screen.findByText('Initial version')
    expect(screen.queryByText('Compare')).not.toBeInTheDocument()
  })

  it('offers a way back to the prompt list', async () => {
    mockApi({ [`/prompts/${ID}/versions`]: () => json(VERSIONS), [`/prompts/${ID}`]: () => json(PROMPT) })
    render(<PromptVersions />, { wrapper: createWrapper() })

    const back = await screen.findByRole('link', { name: /Back to Prompts/ })
    expect(back).toHaveAttribute('href', '/prompts')
  })
})
