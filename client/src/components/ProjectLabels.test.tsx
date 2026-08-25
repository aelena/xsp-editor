import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ProjectLabels } from './ProjectLabels.tsx'
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
} from '../api/membership.ts'

const ALPHA_ID = 'aaaaaaaa-0000-4000-8000-000000000001'

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

const PROJECT_LIST = {
  projects: [
    {
      id: GENERAL_PROJECT_ID,
      name: 'General',
      path: null,
      is_git_repo: false,
      is_reserved: true,
      created_at: '',
      updated_at: '',
    },
    {
      id: ALPHA_ID,
      name: 'Alpha',
      path: null,
      is_git_repo: false,
      is_reserved: false,
      created_at: '',
      updated_at: '',
    },
  ],
}

/**
 * Routes fetch by URL and method, so a test can describe the server's answers
 * rather than the order the component happens to ask in.
 */
function mockApi(
  handlers: Partial<
    Record<string, (init?: RequestInit) => Response>
  >,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    for (const [pattern, handler] of Object.entries(handlers)) {
      const [method, path] = pattern.split(' ')
      if (url.includes(path) && (init?.method ?? 'GET') === method) {
        return Promise.resolve(handler!(init))
      }
    }
    return Promise.resolve(json({ error: `unhandled ${init?.method ?? 'GET'} ${url}` }, 500))
  })
}

afterEach(() => vi.restoreAllMocks())

describe('ProjectLabels', () => {
  it('shows the projects a prompt belongs to, by name', async () => {
    mockApi({
      'GET /prompts/p1/projects': () =>
        json({
          projects: [
            { id: GENERAL_PROJECT_ID, name: 'General', is_reserved: true },
            { id: ALPHA_ID, name: 'Alpha', is_reserved: false },
          ],
          archived: false,
        }),
      'GET /projects': () => json(PROJECT_LIST),
    })

    render(<ProjectLabels kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

    expect(await screen.findByText('General')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('asks archive-or-General when removing the last project', async () => {
    // The 409 is not a failure: it is the server declining to choose. A UI that
    // rendered it as an error would leave the user stuck with no way to finish
    // the action they started.
    const remove = vi.fn(() =>
      json({ error: 'last project', requires: 'archive_or_general' }, 409),
    )
    mockApi({
      'GET /prompts/p1/projects': () =>
        json({
          projects: [{ id: GENERAL_PROJECT_ID, name: 'General', is_reserved: true }],
          archived: false,
        }),
      'GET /projects': () => json(PROJECT_LIST),
      'DELETE /prompts/p1/projects/': remove,
    })

    render(<ProjectLabels kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByLabelText('Remove from General'))

    expect(await screen.findByText(/only project this belongs to/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move to General' })).toBeInTheDocument()
  })

  it('sends the choice the user made, not a default', async () => {
    const urls: string[] = []
    mockApi({
      'GET /prompts/p1/projects': () =>
        json({
          projects: [{ id: GENERAL_PROJECT_ID, name: 'General', is_reserved: true }],
          archived: false,
        }),
      'GET /projects': () => json(PROJECT_LIST),
      'DELETE /prompts/p1/projects/': () =>
        json({ error: 'last project', requires: 'archive_or_general' }, 409),
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const original = fetchSpy.getMockImplementation()!
    fetchSpy.mockImplementation((input, init) => {
      if ((init?.method ?? 'GET') === 'DELETE') urls.push(String(input))
      return original(input, init)
    })

    render(<ProjectLabels kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByLabelText('Remove from General'))
    await userEvent.click(await screen.findByRole('button', { name: 'Archive it' }))

    await waitFor(() => expect(urls).toHaveLength(2))
    // The first attempt carries no answer, which is what provokes the question.
    expect(urls[0]).not.toContain('orphans=')
    expect(urls[1]).toContain('orphans=archive')
  })

  it('renders Archive as a state rather than another label', async () => {
    // An archived prompt is in Archive and nowhere else, so offering to remove
    // it from Archive alongside projects it is not in would misdescribe the
    // model.
    mockApi({
      'GET /prompts/p1/projects': () =>
        json({
          projects: [{ id: ARCHIVE_PROJECT_ID, name: 'Archive', is_reserved: true }],
          archived: true,
        }),
      'GET /projects': () => json(PROJECT_LIST),
    })

    render(<ProjectLabels kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

    expect(await screen.findByText('Archived')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Restore to General/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Project' })).not.toBeInTheDocument()
  })

  it('offers only the projects the prompt is not already in', async () => {
    mockApi({
      'GET /prompts/p1/projects': () =>
        json({
          projects: [{ id: GENERAL_PROJECT_ID, name: 'General', is_reserved: true }],
          archived: false,
        }),
      'GET /projects': () => json(PROJECT_LIST),
    })

    render(<ProjectLabels kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: '+ Project' }))
    const select = await screen.findByLabelText('Add to project')

    expect(select).toHaveDisplayValue('Choose a project')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toContain('Alpha')
    // Already a member, so it is not on offer.
    expect(options).not.toContain('General')
  })

  it('never offers Archive as something to add', async () => {
    // Archiving is its own action with its own consequences. Reaching it through
    // a list of projects would make it look like just another membership.
    mockApi({
      'GET /prompts/p1/projects': () =>
        json({
          projects: [{ id: GENERAL_PROJECT_ID, name: 'General', is_reserved: true }],
          archived: false,
        }),
      'GET /projects': () =>
        json({
          projects: [
            ...PROJECT_LIST.projects,
            {
              id: ARCHIVE_PROJECT_ID,
              name: 'Archive',
              path: null,
              is_git_repo: false,
              is_reserved: true,
              created_at: '',
              updated_at: '',
            },
          ],
        }),
    })

    render(<ProjectLabels kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByRole('button', { name: '+ Project' }))
    const options = Array.from(
      (await screen.findByLabelText('Add to project')).querySelectorAll('option'),
    ).map((o) => o.textContent)

    expect(options).toContain('Alpha')
    expect(options).not.toContain('Archive')
  })

  it('hides the controls for a read-only artifact', async () => {
    mockApi({
      'GET /templates/base/projects': () =>
        json({
          projects: [{ id: GENERAL_PROJECT_ID, name: 'General', is_reserved: true }],
          archived: false,
        }),
      'GET /projects': () => json(PROJECT_LIST),
    })

    render(<ProjectLabels kind="templates" artifactKey="base" readOnly />, {
      wrapper: createWrapper(),
    })

    expect(await screen.findByText('General')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Remove from General')).not.toBeInTheDocument()
  })

  it('reports a real failure as an error', async () => {
    // A 409 asking a question and a 500 are different things, and only one of
    // them should look like something went wrong.
    mockApi({
      'GET /prompts/p1/projects': () =>
        json({
          projects: [
            { id: GENERAL_PROJECT_ID, name: 'General', is_reserved: true },
            { id: ALPHA_ID, name: 'Alpha', is_reserved: false },
          ],
          archived: false,
        }),
      'GET /projects': () => json(PROJECT_LIST),
      'DELETE /prompts/p1/projects/': () => json({ error: 'Storage exploded' }, 500),
    })

    render(<ProjectLabels kind="prompts" artifactKey="p1" />, { wrapper: createWrapper() })

    await userEvent.click(await screen.findByLabelText('Remove from Alpha'))

    expect(await screen.findByText('Storage exploded')).toBeInTheDocument()
    expect(screen.queryByText(/only project this belongs to/i)).not.toBeInTheDocument()
  })
})
