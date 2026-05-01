import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'
import { constraintSchema, listConstraintsResponseSchema } from './schemas.ts'
import type { z } from 'zod'

export type Constraint = z.infer<typeof constraintSchema>

export interface ListConstraintsResponse {
  constraints: Constraint[]
  total: number
  page: number
  limit: number
}

export interface CreateConstraintRequest {
  id: string
  description: string
  severity: Constraint['severity']
  category: Constraint['category']
  owner: string
  xml_block: string
}

export interface UpdateConstraintRequest {
  description?: string
  severity?: Constraint['severity']
  category?: Constraint['category']
  owner?: string
  status?: Constraint['status']
  xml_block?: string
}

export function useConstraints() {
  return useQuery({
    queryKey: ['constraints'],
    queryFn: () => apiFetch<ListConstraintsResponse>('/constraints', undefined, listConstraintsResponseSchema),
  })
}

export function useCreateConstraint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateConstraintRequest) =>
      apiFetch<Constraint>('/constraints', {
        method: 'POST',
        body: JSON.stringify(data),
      }, constraintSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['constraints'] })
    },
  })
}

export function useUpdateConstraint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateConstraintRequest & { id: string }) =>
      apiFetch<Constraint>(`/constraints/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }, constraintSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['constraints'] })
    },
  })
}

export function useDeleteConstraint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<undefined>(`/constraints/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['constraints'] })
    },
  })
}
