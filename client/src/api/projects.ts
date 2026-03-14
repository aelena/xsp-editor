import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface Project {
  id: string
  name: string
  path: string
  is_git_repo: boolean
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
    mutationFn: (data: { name: string; path: string }) =>
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
