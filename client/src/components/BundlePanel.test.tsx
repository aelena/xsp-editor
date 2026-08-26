import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BundlePanel } from './BundlePanel.tsx'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

/**
 * A fresh Response per call.
 *
 * mockResolvedValue hands the same instance to every caller, and a Response body
 * can only be read once. The second fetch in a test then failed with "Body has
 * already been read", which says nothing about the code under test.
 */
function mockFetch(make: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(make()))
}

const PLAN = {
  dry_run: true,
  on_conflict: 'skip',
  created: 7,
  updated: 0,
  skipped: 2,
  failed: [] as { kind: string; key: string; reason: string }[],
  notes: [] as string[],
}

function bundleFile(contents: unknown = { format: 1, prompts: [] }, name = 'backup.json') {
  return new File([JSON.stringify(contents)], name, { type: 'application/json' })
}

const fileField = () => screen.getByLabelText(/Import a bundle/)

afterEach(() => vi.restoreAllMocks())

describe('exporting', () => {
  it('sends the session token, because a link could not', async () => {
    // An anchor cannot set a header, so a plain link to the endpoint would
    // download a 401 as a JSON file.
    localStorage.setItem('xsp.session', 'the-token')
    const spy = mockFetch(() =>
      json({ format: 1 }, 200, { 'content-disposition': 'attachment; filename="x.json"' }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: 'Export everything' }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('the-token')
    localStorage.removeItem('xsp.session')
  })

  it('reports a failed export rather than doing nothing visible', async () => {
    mockFetch(() => json({ error: 'nope' }, 500))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: 'Export everything' }))

    expect(await screen.findByText(/answered 500/)).toBeInTheDocument()
  })
})

describe('importing', () => {
  it('examines the file and reports what would happen, without importing', async () => {
    // It writes over somebody's work, so the only honest way to offer it is to
    // say what it will touch first.
    const spy = mockFetch(() => json(PLAN))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile())

    expect(await screen.findByText(/would add/)).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(String(spy.mock.calls[0][0])).toContain('dry_run=true')
  })

  it('applies it only on the second, explicit step', async () => {
    const spy = mockFetch(() => json(PLAN))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile())
    await userEvent.click(await screen.findByRole('button', { name: 'Import it' }))

    await waitFor(() => expect(spy.mock.calls).toHaveLength(2))
    expect(String(spy.mock.calls[1][0])).not.toContain('dry_run')
  })

  it('skips by default and overwrites only when asked', async () => {
    // Overwriting by default eats an afternoon the first time somebody runs it
    // against the wrong instance.
    const spy = mockFetch(() => json(PLAN))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile())
    await waitFor(() => expect(String(spy.mock.calls[0][0])).toContain('on_conflict=skip'))

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.upload(fileField(), bundleFile())

    await waitFor(() =>
      expect(spy.mock.calls.some((c) => String(c[0]).includes('on_conflict=overwrite'))).toBe(true),
    )
  })

  it('warns about what overwriting means', async () => {
    mockFetch(() => json(PLAN))
    render(<BundlePanel />, { wrapper: createWrapper() })

    await userEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText(/will be replaced/)).toBeInTheDocument()
  })

  it('names the file when its contents are not JSON', async () => {
    // A truncated download, or the wrong file renamed. The input's accept filter
    // keeps a .txt out of the picker entirely, so the reachable case is a .json
    // that does not parse, and "Unexpected token" alone does not tell anyone
    // which file they chose.
    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(
      fileField(),
      new File(['{ truncated'], 'backup.json', { type: 'application/json' }),
    )

    expect(await screen.findByText('backup.json is not valid JSON.')).toBeInTheDocument()
  })

  it('shows the server’s complaint about an unrecognised bundle', async () => {
    mockFetch(() => json({ error: 'This bundle is format 99 and this build reads format 1.' }, 400))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile({ format: 99 }))

    expect(await screen.findByText(/format 99/)).toBeInTheDocument()
  })

  it('lists the records it cannot read, so they are not a silent loss', async () => {
    mockFetch(() =>
      json({ ...PLAN, failed: [{ kind: 'prompts', key: '?', reason: 'no identifier' }] }),
    )

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile())

    expect(await screen.findByText(/cannot be read/)).toBeInTheDocument()
    expect(screen.getByText(/no identifier/)).toBeInTheDocument()
  })

  it('passes on the server’s notes, such as the audit trail being skipped', async () => {
    mockFetch(() => json({ ...PLAN, notes: ['12 audit entries were not imported.'] }))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile())

    expect(await screen.findByText(/audit entries were not imported/)).toBeInTheDocument()
  })

  it('cancels without importing', async () => {
    const spy = mockFetch(() => json(PLAN))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile())
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('button', { name: 'Import it' })).not.toBeInTheDocument()
    expect(spy.mock.calls).toHaveLength(1)
  })

  it('says what it did after importing', async () => {
    mockFetch(() => json({ ...PLAN, dry_run: false, created: 7, updated: 1, skipped: 2 }))

    render(<BundlePanel />, { wrapper: createWrapper() })
    await userEvent.upload(fileField(), bundleFile())
    await userEvent.click(await screen.findByRole('button', { name: 'Import it' }))

    // The sentence is interpolated, so it lands as several text nodes in one
    // paragraph and an exact string match never finds it.
    expect(
      await screen.findByText(
        (_, element) => element?.textContent === 'Added 7, updated 1, skipped 2.',
        { selector: 'p' },
      ),
    ).toBeInTheDocument()
  })
})
