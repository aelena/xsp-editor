import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface Project {
  id: string
  name: string
  /** Null when the project is only a logical grouping and has no folder. */
  path: string | null
  is_git_repo: boolean
  /** General and Archive, which cannot be renamed or deleted. */
  is_reserved: boolean
  created_at: string
  updated_at: string
}

export interface GitStatusEntry {
  status: string
  path: string
}

export interface GitLogEntry {
  hash: string
  short_hash: string
  author: string
  date: string
  message: string
}

export interface DirectoryListing {
  current: string
  /** Null at a filesystem root, so the caller knows not to offer "up". */
  parent: string | null
  directories: { name: string; path: string }[]
}

/**
 * List the directories inside a path, for the folder picker.
 *
 * Omitting the path asks the server to start from the user's home directory,
 * which is the only sensible starting point it can know about.
 */
export function useDirectoryListing(path: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['browse-folder', path ?? ''],
    queryFn: () =>
      apiFetch<DirectoryListing>(
        `/browse-folder${path ? `?path=${encodeURIComponent(path)}` : ''}`,
      ),
    enabled,
    // Directories change under us while the picker is open, and a stale listing
    // is worse than a slightly slower one.
    staleTime: 0,
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: Project[] }>('/projects'),
  })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => apiFetch<Project>(`/projects/${id}`),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    // The path is optional: a project can be nothing but a grouping, and only
    // becomes a workspace when someone points it at a folder.
    mutationFn: (data: { name: string; path?: string }) =>
      apiFetch<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useGitStatus(projectId: string | undefined) {
  return useQuery({
    queryKey: ['git-status', projectId],
    queryFn: () =>
      apiFetch<{ status: GitStatusEntry[] }>(
        `/projects/${projectId}/git/status`,
      ),
    enabled: !!projectId,
    refetchInterval: 5000,
  })
}

export function useGitLog(projectId: string | undefined) {
  return useQuery({
    queryKey: ['git-log', projectId],
    queryFn: () =>
      apiFetch<{ log: GitLogEntry[] }>(`/projects/${projectId}/git/log`),
    enabled: !!projectId,
  })
}

export function useGitCommit(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { message: string; files?: string[] }) =>
      apiFetch<{ message: string; output: string }>(
        `/projects/${projectId}/git/commit`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-status', projectId] })
      queryClient.invalidateQueries({ queryKey: ['git-log', projectId] })
    },
  })
}

export function useGitInit(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ message: string }>(`/projects/${projectId}/git/init`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })
}
