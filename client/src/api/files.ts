import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  extension?: string
}

export interface FileContent {
  content: string
  path: string
  size: number
  modified_at: string
}

export interface Template {
  name: string
  description: string
  content: string
  category: string
  is_builtin: boolean
  created_at: string
  updated_at: string
}

export function useFileTree(projectPath: string | undefined) {
  return useQuery({
    queryKey: ['file-tree', projectPath],
    queryFn: () =>
      apiFetch<{ files: FileEntry[] }>(
        `/files?projectPath=${encodeURIComponent(projectPath!)}`,
      ),
    enabled: !!projectPath,
  })
}

export function useFileContent(
  projectPath: string | undefined,
  filePath: string | undefined,
) {
  return useQuery({
    queryKey: ['file-content', projectPath, filePath],
    queryFn: () =>
      apiFetch<FileContent>(
        `/files/read?projectPath=${encodeURIComponent(projectPath!)}&filePath=${encodeURIComponent(filePath!)}`,
      ),
    enabled: !!projectPath && !!filePath,
  })
}

export function useSaveFile(projectPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { filePath: string; content: string }) =>
      apiFetch<{ path: string; message: string }>(
        `/files/write?projectPath=${encodeURIComponent(projectPath)}&filePath=${encodeURIComponent(data.filePath)}`,
        { method: 'PUT', body: JSON.stringify({ content: data.content }) },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['file-tree', projectPath] })
      queryClient.invalidateQueries({
        queryKey: ['file-content', projectPath, variables.filePath],
      })
    },
  })
}

export function useDeleteFile(projectPath: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filePath: string) =>
      apiFetch<void>(
        `/files?projectPath=${encodeURIComponent(projectPath)}&filePath=${encodeURIComponent(filePath)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-tree', projectPath] })
    },
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<{ templates: Template[] }>('/templates'),
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      description: string
      content: string
      category?: string
    }) =>
      apiFetch<Template>('/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      name,
      ...data
    }: {
      name: string
      description?: string
      content?: string
      category?: string
    }) =>
      apiFetch<Template>(`/templates/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<void>(`/templates/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
