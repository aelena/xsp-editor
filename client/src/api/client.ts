import type { ZodType } from 'zod'

const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  /**
   * The whole parsed error body, not just its message.
   *
   * Several endpoints answer 409 with the information the caller needs to ask
   * the user a question and retry: `requires: "archive_or_general"` when a
   * removal would leave a prompt with no project, or `orphan_count` when
   * deleting a project would. Reducing that to a string threw away the only
   * part the UI could act on.
   */
  body: Record<string, unknown>

  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * The credential to send, if there is one.
 *
 * The session token wins over the build-time variable: a signed-in user's token
 * is the current truth, and VITE_API_AUTH_TOKEN is the older single-shared-key
 * arrangement kept working for anyone already using it.
 *
 * Read from localStorage directly rather than imported from api/auth.ts, to
 * keep the dependency pointing one way: auth builds on the fetch wrapper, not
 * the other way round.
 */
function getApiKey(): string | undefined {
  try {
    const session = localStorage.getItem('xsp.session')
    if (session) return session
  } catch {
    // Storage unavailable. Fall through to the build-time token.
  }
  return import.meta.env.VITE_API_AUTH_TOKEN || undefined
}

/**
 * Called when the server says a request was not authenticated.
 *
 * A callback rather than a redirect here, because this module has no idea what
 * the UI looks like. AuthGate registers one that drops the token and shows the
 * sign-in screen.
 */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
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
    if (response.status === 401) {
      // An expired or revoked session looks exactly like this. Without it the
      // UI shows an error on every panel instead of asking for a password.
      onUnauthorized?.()
    }
    throw new ApiError(
      response.status,
      body.error || `Request failed with status ${response.status}`,
      body,
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
