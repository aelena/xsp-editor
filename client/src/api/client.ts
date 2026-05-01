import type { ZodType } from 'zod'

const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function getApiKey(): string | undefined {
  return import.meta.env.VITE_API_AUTH_TOKEN || undefined
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  schema?: ZodType<T>,
): Promise<T> {
  const apiKey = getApiKey()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  if (apiKey) {
    headers['X-API-Key'] = apiKey
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(
      response.status,
      body.error || `Request failed with status ${response.status}`,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json()

  if (schema) {
    return schema.parse(data)
  }

  return data as T
}
