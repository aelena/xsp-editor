import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface Constraint {
  id: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'content' | 'safety' | 'style' | 'structural' | 'evidence' | 'output'
  owner: string
  status: 'active' | 'deprecated' | 'retired'
  xml_block: string
  usage_count: number
  created_at: string
  updated_at: string
}

export interface ListConstraintsResponse {
  constraints: Constraint[]
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
    queryFn: () => apiFetch<ListConstraintsResponse>('/constraints'),
  })
}

export function useCreateConstraint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateConstraintRequest) =>
      apiFetch<Constraint>('/constraints', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
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
      }),
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
