import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { AuthGate } from './AuthGate.tsx'
import { apiFetch } from '../api/client.ts'
import { getToken, setToken } from '../api/auth.ts'

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
    for (const [pattern, handler] of Object.entries(handlers)) {
      const [method, path] = pattern.split(' ')
      if (url.includes(path) && (init?.method ?? 'GET') === method) {
        return Promise.resolve(handler(init))
      }
    }
    return Promise.resolve(json({ error: `unhandled ${url}` }, 500))
  })
}

const INSIDE = <p>The application</p>

beforeEach(() => setToken(null))
afterEach(() => {
  vi.restoreAllMocks()
  setToken(null)
})

describe('AuthGate', () => {
  it('shows the application when the server does not want a login', async () => {
    // The local case: one person, loopback, no friction.
    mockApi({
      'GET /auth/status': () => json({ auth_required: false, needs_bootstrap: true }),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    expect(await screen.findByText('The application')).toBeInTheDocument()
  })

  it('asks to create the first account when there is none', async () => {
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: true }),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    expect(screen.queryByText('The application')).not.toBeInTheDocument()
  })

  it('asks for a password when an account already exists', async () => {
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: false }),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('says the server is unreachable rather than showing a useless form', async () => {
    // Almost always the API not running. A sign-in form that cannot possibly
    // work is a worse answer than saying so.
    mockApi({ 'GET /auth/status': () => json({ error: 'nope' }, 500) })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument()
  })

  it('signs in and reveals the application', async () => {
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: false }),
      'POST /auth/login': () =>
        json({ user: { id: 'u1', username: 'antonio', display_name: 'A', created_at: '' }, token: 'tok' }),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'Sign in' })

    await userEvent.type(screen.getByLabelText('Username'), 'antonio')
    await userEvent.type(screen.getByLabelText('Password'), 'a password long enough')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('The application')).toBeInTheDocument()
    expect(getToken()).toBe('tok')
  })

  it('keeps the password out of the URL and the query string', async () => {
    const seen: string[] = []
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: false }),
      'POST /auth/login': (init) => {
        seen.push(String(init?.body))
        return json({ user: { id: 'u1', username: 'a', display_name: 'a', created_at: '' }, token: 't' })
      },
    })
    const spy = vi.spyOn(globalThis, 'fetch')

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText('Username'), 'antonio')
    await userEvent.type(screen.getByLabelText('Password'), 'secret enough here')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(seen).toHaveLength(1))
    for (const call of spy.mock.calls) {
      expect(String(call[0])).not.toContain('secret')
    }
    expect(seen[0]).toContain('secret enough here')
  })

  it('shows the server error rather than a blank failure', async () => {
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: false }),
      'POST /auth/login': () => json({ error: 'Wrong username or password' }, 401),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText('Username'), 'antonio')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password here')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Wrong username or password')).toBeInTheDocument()
    expect(screen.queryByText('The application')).not.toBeInTheDocument()
  })

  it('refuses to submit a first password under twelve characters', async () => {
    // Caught before the round trip, so the answer arrives while the person is
    // still looking at the field.
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: true }),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    await screen.findByRole('heading', { name: 'Create your account' })

    await userEvent.type(screen.getByLabelText('Username'), 'antonio')
    await userEvent.type(screen.getByLabelText('Password'), 'short')

    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  })

  it('goes straight in when a token is already stored', async () => {
    setToken('an-existing-session')
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: false }),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    expect(await screen.findByText('The application')).toBeInTheDocument()
  })

  it('drops back to the sign-in screen when a session stops being valid', async () => {
    // An expired or revoked session. Without this every panel renders its own
    // error about being unauthorised instead of one form asking for a password.
    setToken('an-expired-session')
    mockApi({
      'GET /auth/status': () => json({ auth_required: true, needs_bootstrap: false }),
      'GET /prompts': () => json({ error: 'Session is not valid' }, 401),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    expect(await screen.findByText('The application')).toBeInTheDocument()

    await expect(apiFetch('/prompts')).rejects.toThrow()

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('sends the stored token on every request', async () => {
    setToken('the-session-token')
    const spy = mockApi({
      'GET /auth/status': () => json({ auth_required: false, needs_bootstrap: false }),
      'GET /prompts': () => json({ prompts: [], total: 0, page: 1, limit: 20 }),
    })

    render(<AuthGate>{INSIDE}</AuthGate>, { wrapper: createWrapper() })
    await screen.findByText('The application')
    await apiFetch('/prompts')

    const headers = spy.mock.calls.at(-1)?.[1]?.headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('the-session-token')
  })
})
