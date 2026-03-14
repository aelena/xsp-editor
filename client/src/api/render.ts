import { useMutation } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface RenderResponse {
  rendered: string
  token_estimate: number
  unresolved_variables: string[]
}

export function useRender() {
  return useMutation({
    mutationFn: (data: {
      content: string
      variables?: Record<string, string>
    }) =>
      apiFetch<RenderResponse>('/render', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  })
}
