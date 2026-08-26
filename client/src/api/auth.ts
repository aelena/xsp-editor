import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

/**
 * Sessions, from the client's side.
 *
 * The token lives in localStorage. That is readable by any script running on
 * this origin, so it is only as safe as the page is from XSS; the alternative,
 * an httpOnly cookie, would be safer but needs CSRF handling and a same-site
 * story that the dev server's proxy does not have. For a tool served from
 * localhost to its own user this is the right trade, and it is written down
 * rather than assumed.
 */

const TOKEN_KEY = 'xsp.session'

export interface User {
  id: string
  username: string
  display_name: string
  created_at: string
}

export interface AuthStatus {
  auth_required: boolean
  /** True until the first account exists. */
  needs_bootstrap: boolean
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Private browsing and some embedded webviews throw rather than returning
    // null. Being signed out is a better answer than a blank page.
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing useful to do. The session lasts until the tab closes.
  }
}

/**
 * Whether this server wants a login at all, and whether anyone exists yet.
 *
 * Never retried and never cached for long: it decides which screen to draw, so
 * a stale answer shows the wrong one.
 */
export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth-status'],
    queryFn: () => apiFetch<AuthStatus>('/auth/status'),
    retry: false,
    staleTime: 0,
  })
}

export function useCurrentUser(enabled: boolean) {
  return useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiFetch<{ user: User }>('/auth/me'),
    enabled,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      apiFetch<{ user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: (result) => {
      setToken(result.token)
      // Everything fetched while signed out was fetched as nobody.
      queryClient.clear()
    },
  })
}

export function useBootstrap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      apiFetch<{ user: User; token: string }>('/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: (result) => {
      setToken(result.token)
      queryClient.clear()
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    // Whether or not the server confirmed, this browser is signed out. A logout
    // that leaves the token behind because the request failed is the worst of
    // both.
    onSettled: () => {
      setToken(null)
      queryClient.clear()
    },
  })
}
