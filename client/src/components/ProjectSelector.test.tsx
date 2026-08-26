import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ProjectSelector from './ProjectSelector.tsx'
import type { Project } from '../api/projects.ts'

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

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Workspace',
    path: '/home/someone/work',
    is_git_repo: false,
    is_reserved: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
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
    return Promise.resolve(json({ error: `unhandled ${init?.method ?? 'GET'} ${url}` }, 500))
  })
}

const LISTING = {
  current: '/home/someone',
  parent: '/home',
  directories: [
    { name: 'work', path: '/home/someone/work' },
    { name: 'documents', path: '/home/someone/documents' },
  ],
}

const BASE = { 'GET /projects': () => json({ projects: [project()] }) }

function renderSelector(props: Partial<Parameters<typeof ProjectSelector>[0]> = {}) {
  return render(
    <ProjectSelector
      currentProjectId={null}
      onSelectProject={props.onSelectProject ?? vi.fn()}
      {...props}
    />,
    { wrapper: createWrapper() },
  )
}

afterEach(() => vi.restoreAllMocks())

describe('ProjectSelector', () => {
  it('lists the projects', async () => {
    mockApi(BASE)
    renderSelector()
    expect(await screen.findByText('Workspace')).toBeInTheDocument()
  })

  it('says there are none rather than showing an empty strip', async () => {
    mockApi({ 'GET /projects': () => json({ projects: [] }) })
    renderSelector()
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
  })

  it('marks which projects are git repositories', async () => {
    mockApi({
      'GET /projects': () =>
        json({
          projects: [
            project({ name: 'Tracked', is_git_repo: true }),
            project({ id: 'bbbbbbbb-0000-4000-8000-000000000002', name: 'Untracked' }),
          ],
        }),
    })
    renderSelector()
    await screen.findByText('Tracked')

    expect(screen.getByTitle('Git repo')).toBeInTheDocument()
    expect(screen.getByTitle('No git')).toBeInTheDocument()
  })

  it('reports a selection to the caller', async () => {
    const onSelectProject = vi.fn()
    mockApi(BASE)
    renderSelector({ onSelectProject })

    await userEvent.click(await screen.findByText('Workspace'))
    expect(onSelectProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Workspace' }))
  })

  it('clears the selection when the selected project is removed', async () => {
    // Otherwise the editor keeps a project id that no longer resolves, and
    // every file operation fails against something that is not there.
    const onSelectProject = vi.fn()
    mockApi({ ...BASE, 'DELETE /projects/': () => new Response(null, { status: 204 }) })
    renderSelector({ currentProjectId: project().id, onSelectProject })

    await screen.findByText('Workspace')
    await userEvent.click(screen.getByTitle('Remove project'))

    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith(null))
  })

  it('does not select a project when its remove button is clicked', async () => {
    // The row is clickable, so removing has to stop the event or every deletion
    // also selects the thing being deleted.
    const onSelectProject = vi.fn()
    mockApi({ ...BASE, 'DELETE /projects/': () => new Response(null, { status: 204 }) })
    renderSelector({ onSelectProject })

    await screen.findByText('Workspace')
    await userEvent.click(screen.getByTitle('Remove project'))

    await waitFor(() => expect(onSelectProject).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Workspace' }),
    ))
  })
})

describe('adding a project', () => {
  it('opens and closes the form', async () => {
    mockApi(BASE)
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    expect(screen.getByPlaceholderText('Project name')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByPlaceholderText('Project name')).not.toBeInTheDocument()
  })

  it('will not submit without both a name and a path', async () => {
    mockApi(BASE)
    renderSelector()
    await screen.findByText('Workspace')
    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))

    const submit = screen.getByRole('button', { name: 'Add Project' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Project name'), 'New')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Directory path'), '/tmp/new')
    expect(submit).toBeEnabled()
  })

  it('creates one', async () => {
    const posted: string[] = []
    mockApi({
      ...BASE,
      'POST /projects': (init) => {
        posted.push(String(init?.body))
        return json(project({ name: 'New' }), 201)
      },
    })
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.type(screen.getByPlaceholderText('Project name'), 'New')
    await userEvent.type(screen.getByPlaceholderText('Directory path'), '/tmp/new')
    await userEvent.click(screen.getByRole('button', { name: 'Add Project' }))

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(JSON.parse(posted[0])).toEqual({ name: 'New', path: '/tmp/new' })
  })

  it('shows why the server refused', async () => {
    mockApi({
      ...BASE,
      'POST /projects': () => json({ error: 'Directory does not exist' }, 400),
    })
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.type(screen.getByPlaceholderText('Project name'), 'New')
    await userEvent.type(screen.getByPlaceholderText('Directory path'), '/nowhere')
    await userEvent.click(screen.getByRole('button', { name: 'Add Project' }))

    expect(await screen.findByText('Directory does not exist')).toBeInTheDocument()
  })
})

describe('the folder picker', () => {
  it('opens on the server’s starting point', async () => {
    // The client cannot know a sensible home directory, which is why the server
    // chooses when no path is given. This replaced a native dialog that opened
    // on the server's desktop and blocked the request for a minute.
    mockApi({ ...BASE, 'GET /browse-folder': () => json(LISTING) })
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(screen.getByTitle('Browse for folder'))

    expect(await screen.findByText('/home/someone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'work' })).toBeInTheDocument()
  })

  it('navigates into a directory', async () => {
    const asked: string[] = []
    mockApi({
      ...BASE,
      'GET /browse-folder': (init) => {
        void init
        return json(LISTING)
      },
    })
    const spy = vi.spyOn(globalThis, 'fetch')

    renderSelector()
    await screen.findByText('Workspace')
    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(screen.getByTitle('Browse for folder'))
    await userEvent.click(await screen.findByRole('button', { name: 'work' }))

    await waitFor(() => {
      asked.push(...spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('browse')))
      expect(asked.some((u) => u.includes(encodeURIComponent('/home/someone/work')))).toBe(true)
    })
  })

  it('offers a way back up, and none at a filesystem root', async () => {
    mockApi({ ...BASE, 'GET /browse-folder': () => json({ ...LISTING, parent: null }) })
    renderSelector()
    await screen.findByText('Workspace')
    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(screen.getByTitle('Browse for folder'))

    await screen.findByText('/home/someone')
    // The server says parent is null, so the client draws no "up" rather than
    // comparing strings to work it out.
    expect(screen.queryByRole('button', { name: '.. up' })).not.toBeInTheDocument()
  })

  it('fills the path in when a folder is chosen, and names the project after it', async () => {
    mockApi({ ...BASE, 'GET /browse-folder': () => json(LISTING) })
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(screen.getByTitle('Browse for folder'))
    await userEvent.click(await screen.findByRole('button', { name: 'Use this folder' }))

    expect(screen.getByPlaceholderText('Directory path')).toHaveValue('/home/someone')
    // The last segment is almost always the name someone would have typed.
    expect(screen.getByPlaceholderText('Project name')).toHaveValue('someone')
  })

  it('closes without choosing on cancel', async () => {
    mockApi({ ...BASE, 'GET /browse-folder': () => json(LISTING) })
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(screen.getByTitle('Browse for folder'))
    await screen.findByText('/home/someone')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel choosing a folder' }))

    expect(screen.getByPlaceholderText('Directory path')).toHaveValue('')
  })

  it('says a folder cannot be read instead of showing an empty list', async () => {
    mockApi({
      ...BASE,
      'GET /browse-folder': () => json({ error: 'Cannot read directory' }, 400),
    })
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(screen.getByTitle('Browse for folder'))

    expect(await screen.findByText('Cannot read that folder.')).toBeInTheDocument()
  })

  it('says a folder is empty rather than looking broken', async () => {
    mockApi({
      ...BASE,
      'GET /browse-folder': () => json({ ...LISTING, directories: [] }),
    })
    renderSelector()
    await screen.findByText('Workspace')

    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(screen.getByTitle('Browse for folder'))

    expect(await screen.findByText('No subfolders')).toBeInTheDocument()
  })
})
