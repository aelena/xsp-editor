import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'
import type { Project } from './projects.ts'

/**
 * Membership, archiving, forking and the audit trail.
 *
 * Prompts and templates get the same endpoints, so the hooks take a `kind` and
 * a key rather than existing twice. The key is a UUID for a prompt and a name
 * for a template, which is the convention the rest of the API already uses.
 */

export type ArtifactKind = 'prompts' | 'templates'

/** Fixed ids, so the UI can special-case the two reserved projects. */
export const GENERAL_PROJECT_ID = '00000000-0000-4000-8000-000000000001'
export const ARCHIVE_PROJECT_ID = '00000000-0000-4000-8000-000000000002'

export interface MembershipLabel {
  id: string
  name: string
  is_reserved: boolean
}

export interface Membership {
  projects: MembershipLabel[]
  archived: boolean
}

export type OrphanChoice = 'archive' | 'general'

export interface AuditEntry {
  at: string
  actor: string
  kind: 'prompt' | 'template'
  artifact_id: string
  artifact_name: string
  operation: string
  project?: string | null
  before: string[]
  after: string[]
  detail?: Record<string, string>
}

export interface TreeNode {
  project: Project
  prompts: {
    id: string
    name: string
    version: string
    verification_status: string
  }[]
  templates: { name: string; category: string; is_builtin: boolean }[]
}

/**
 * Everything a membership change can invalidate.
 *
 * Collected in one place because a change to one prompt's projects moves it in
 * the tree, in the list and under its own labels, and a UI that updates one of
 * the three is a UI that looks broken.
 */
function invalidateMembership(
  queryClient: ReturnType<typeof useQueryClient>,
  kind: ArtifactKind,
  key: string,
) {
  queryClient.invalidateQueries({ queryKey: ['membership', kind, key] })
  queryClient.invalidateQueries({ queryKey: ['audit', kind, key] })
  queryClient.invalidateQueries({ queryKey: ['tree'] })
  queryClient.invalidateQueries({ queryKey: ['prompts'] })
  queryClient.invalidateQueries({ queryKey: ['templates'] })
  queryClient.invalidateQueries({ queryKey: ['prompt', key] })
}

export function useMembership(kind: ArtifactKind, key: string | undefined) {
  return useQuery({
    queryKey: ['membership', kind, key],
    queryFn: () => apiFetch<Membership>(`/${kind}/${key}/projects`),
    enabled: !!key,
  })
}

export function useAddToProject(kind: ArtifactKind, key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) =>
      apiFetch<{ projects: string[]; unarchived: boolean }>(
        `/${kind}/${key}/projects`,
        { method: 'POST', body: JSON.stringify({ project_id: projectId }) },
      ),
    onSuccess: () => invalidateMembership(queryClient, kind, key),
  })
}

/**
 * Remove one membership.
 *
 * Throws an ApiError with status 409 and `requires: "archive_or_general"` when
 * this is the last project the artifact belongs to. The caller is expected to
 * ask the user and call again with a choice, rather than the server picking one.
 */
export function useRemoveFromProject(kind: ArtifactKind, key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      orphans,
    }: {
      projectId: string
      orphans?: OrphanChoice
    }) =>
      apiFetch<{ projects: string[]; archived: boolean }>(
        `/${kind}/${key}/projects/${projectId}${orphans ? `?orphans=${orphans}` : ''}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => invalidateMembership(queryClient, kind, key),
  })
}

export function useArchive(kind: ArtifactKind, key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ projects: string[] }>(`/${kind}/${key}/archive`, { method: 'POST' }),
    onSuccess: () => invalidateMembership(queryClient, kind, key),
  })
}

export function useUnarchive(kind: ArtifactKind, key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ projects: string[] }>(`/${kind}/${key}/unarchive`, { method: 'POST' }),
    onSuccess: () => invalidateMembership(queryClient, kind, key),
  })
}

export function useFork<T>(kind: ArtifactKind, key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name?: string) =>
      apiFetch<T>(`/${kind}/${key}/fork`, {
        method: 'POST',
        body: JSON.stringify(name ? { name } : {}),
      }),
    onSuccess: () => invalidateMembership(queryClient, kind, key),
  })
}

export function useAudit(kind: ArtifactKind, key: string | undefined) {
  return useQuery({
    queryKey: ['audit', kind, key],
    queryFn: () => apiFetch<{ entries: AuditEntry[] }>(`/${kind}/${key}/audit`),
    enabled: !!key,
  })
}

export function useTree() {
  return useQuery({
    queryKey: ['tree'],
    queryFn: () => apiFetch<{ tree: TreeNode[] }>('/projects/tree'),
  })
}

/** How many members a project deletion would leave with no project at all. */
export function useOrphanCount(projectId: string | undefined) {
  return useQuery({
    queryKey: ['orphan-count', projectId],
    queryFn: () =>
      apiFetch<{ orphan_count: number; member_count: number }>(
        `/projects/${projectId}/orphan-count`,
      ),
    enabled: !!projectId,
  })
}

/**
 * Delete a project, saying what to do with the members it would orphan.
 *
 * Without the choice the server answers 409 with `orphan_count`, which is what
 * stops a forgotten parameter from archiving things silently.
 */
export function useDeleteProjectWithOrphans() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, orphans }: { id: string; orphans?: OrphanChoice }) =>
      apiFetch<void>(`/projects/${id}${orphans ? `?orphans=${orphans}` : ''}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
