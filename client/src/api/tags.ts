import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface Tag {
  name: string
  purpose: string
  use_when: string
  example: string
  enforcement: 'required' | 'recommended' | 'optional' | 'deprecated'
  usage_count: number
  created_at: string
  updated_at: string
}

export interface ListTagsResponse {
  tags: Tag[]
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => apiFetch<ListTagsResponse>('/tags'),
  })
}
