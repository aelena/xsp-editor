import { useQuery } from '@tanstack/react-query'
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

export function useConstraints() {
  return useQuery({
    queryKey: ['constraints'],
    queryFn: () => apiFetch<ListConstraintsResponse>('/constraints'),
  })
}
