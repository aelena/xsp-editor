import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client.ts'

/**
 * Free-form labels, in the Azure DevOps sense.
 *
 * Not the tag registry. That one is a curated vocabulary of XML element names
 * with a purpose and an enforcement level, and the verification engine checks
 * prompts against it. These are strings somebody typed. They live on separate
 * screens for the same reason they live in separate tables.
 */

export type ArtifactKind = 'prompts' | 'templates'

export interface LabelUsage {
  label: string
  count: number
  prompts: number
  templates: number
}

export interface LabelledArtifact {
  kind: 'prompt' | 'template'
  key: string
}

export function useLabels(kind: ArtifactKind, key: string | undefined) {
  return useQuery({
    queryKey: ['labels', kind, key],
    queryFn: () => apiFetch<{ labels: string[] }>(`/${kind}/${key}/labels`),
    enabled: !!key,
  })
}

export function useSetLabels(kind: ArtifactKind, key: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (labels: string[]) =>
      apiFetch<{ labels: string[] }>(`/${kind}/${key}/labels`, {
        method: 'PUT',
        body: JSON.stringify({ labels }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', kind, key] })
      // The counts on the management screen moved too.
      queryClient.invalidateQueries({ queryKey: ['label-usage'] })
    },
  })
}

export function useLabelUsage() {
  return useQuery({
    queryKey: ['label-usage'],
    queryFn: () => apiFetch<{ labels: LabelUsage[] }>('/labels'),
  })
}

export function useLabelArtifacts(label: string | undefined) {
  return useQuery({
    queryKey: ['label-artifacts', label],
    queryFn: () =>
      apiFetch<{ artifacts: LabelledArtifact[] }>(
        `/labels/${encodeURIComponent(label!)}/artifacts`,
      ),
    enabled: !!label,
  })
}

/** Everything a label change invalidates, in one place. */
function invalidateLabels(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['label-usage'] })
  queryClient.invalidateQueries({ queryKey: ['label-artifacts'] })
  queryClient.invalidateQueries({ queryKey: ['labels'] })
}

export function useRenameLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ label, to }: { label: string; to: string }) =>
      apiFetch<{ label: string; affected: number }>(
        `/labels/${encodeURIComponent(label)}`,
        { method: 'PUT', body: JSON.stringify({ to }) },
      ),
    onSuccess: () => invalidateLabels(queryClient),
  })
}

export function useDeleteLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) =>
      apiFetch<{ removed: string; affected: number }>(
        `/labels/${encodeURIComponent(label)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => invalidateLabels(queryClient),
  })
}
