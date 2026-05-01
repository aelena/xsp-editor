import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'
import { tagSchema, listTagsResponseSchema } from './schemas.ts'
import type { z } from 'zod'

export type Tag = z.infer<typeof tagSchema>

export interface ListTagsResponse {
  tags: Tag[]
  total: number
  page: number
  limit: number
}

export interface CreateTagRequest {
  name: string
  purpose: string
  use_when: string
  example: string
  enforcement: Tag['enforcement']
}

export interface UpdateTagRequest {
  purpose?: string
  use_when?: string
  example?: string
  enforcement?: Tag['enforcement']
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => apiFetch<ListTagsResponse>('/tags', undefined, listTagsResponseSchema),
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTagRequest) =>
      apiFetch<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify(data),
      }, tagSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useUpdateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, ...data }: UpdateTagRequest & { name: string }) =>
      apiFetch<Tag>(`/tags/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }, tagSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<undefined>(`/tags/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}
