import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface Prompt {
  id: string
  name: string
  description: string
  version: string
  content: string
  variables: Record<string, { description: string; required?: boolean }>
  tags_used: string[]
  constraints_referenced: string[]
  author: string
  created_at: string
  updated_at: string
  verification_status: 'passed' | 'warnings' | 'failed' | 'unchecked'
  metadata: Record<string, string>
}

export interface ListPromptsResponse {
  prompts: Prompt[]
  total: number
  page: number
  limit: number
}

export interface ListPromptsParams {
  page?: number
  limit?: number
  search?: string
  author?: string
  tag?: string
}

function buildQueryString(params: ListPromptsParams): string {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.search) searchParams.set('search', params.search)
  if (params.author) searchParams.set('author', params.author)
  if (params.tag) searchParams.set('tag', params.tag)
  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}

export function usePrompts(params: ListPromptsParams = {}) {
  return useQuery({
    queryKey: ['prompts', params],
    queryFn: () =>
      apiFetch<ListPromptsResponse>(`/prompts${buildQueryString(params)}`),
  })
}
