import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

export interface LLMConfig {
  provider: string | null
  model: string | null
  api_key_set: boolean
  default_max_tokens: number
  default_temperature: number
  custom_base_url: string | null
}

export interface LLMTestResponse {
  response: string
  model: string
  tokens: { input: number; output: number; total: number }
  latency_ms: number
  output_validation: { is_valid_json: boolean; parsed: unknown | null }
}

export function useLLMConfig() {
  return useQuery({
    queryKey: ['llm-config'],
    queryFn: () => apiFetch<LLMConfig>('/llm/config'),
  })
}

export function useUpdateLLMConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      provider: string
      model: string
      api_key: string
      default_max_tokens?: number
      default_temperature?: number
      custom_base_url?: string | null
    }) =>
      apiFetch<LLMConfig>('/llm/config', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-config'] })
    },
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean }>('/llm/test-connection', {
        method: 'POST',
      }),
  })
}

export function useTestLLM() {
  return useMutation({
    mutationFn: (data: {
      content: string
      variables?: Record<string, string>
      model_override?: string | null
      max_tokens?: number
      temperature?: number
    }) =>
      apiFetch<LLMTestResponse>('/llm/test', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  })
}
