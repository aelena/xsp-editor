import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export type SearchKind =
  | 'prompt'
  | 'template'
  | 'tag'
  | 'constraint'
  | 'project'
  | 'label'

export interface SearchHit {
  kind: SearchKind
  key: string
  title: string
  context: string
  field: string
}

export interface SearchResult {
  query: string
  total: number
  hits: SearchHit[]
}

/** Where a hit lives, so the palette can navigate without knowing each kind. */
export function hitPath(hit: SearchHit): string {
  switch (hit.kind) {
    case 'prompt':
      return `/prompts/${hit.key}/edit`
    case 'template':
      return '/templates'
    case 'tag':
      return '/tags'
    case 'constraint':
      return '/constraints'
    case 'project':
      return '/projects'
    case 'label':
      return '/labels'
  }
}

/**
 * One search across everything.
 *
 * Debounced by the caller rather than here, so the delay is a property of the
 * input someone is typing into and not of the data.
 */
export function useSearch(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => apiFetch<SearchResult>(`/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length > 0,
    // A search is a question about right now, and a cached answer to a
    // half-typed word is worse than a slightly slower fresh one.
    staleTime: 0,
  })
}
