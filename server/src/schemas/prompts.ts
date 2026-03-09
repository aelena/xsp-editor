import { z } from "zod";

export const variableDefinitionSchema = z.object({
  description: z.string(),
  required: z.boolean().optional().default(true),
});

export const createPromptSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
      message:
        "Name must be lowercase alphanumeric with hyphens, cannot start or end with a hyphen",
    }),
  description: z.string().min(1).max(2000),
  content: z.string().min(1),
  author: z.string().min(1).max(100).optional().default("anonymous"),
  variables: z.record(z.string(), variableDefinitionSchema).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const updatePromptSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/)
    .optional(),
  description: z.string().min(1).max(2000).optional(),
  content: z.string().min(1).optional(),
  version_bump: z.enum(["major", "minor", "patch"]).optional().default("patch"),
  changelog_summary: z.string().max(500).optional(),
  author: z.string().min(1).max(100).optional(),
  variables: z.record(z.string(), variableDefinitionSchema).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const listPromptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  author: z.string().optional(),
  tag: z.string().optional(),
});

export interface PromptRecord {
  id: string;
  name: string;
  description: string;
  version: string;
  content: string;
  variables: Record<string, { description: string; required?: boolean }>;
  tags_used: string[];
  constraints_referenced: string[];
  author: string;
  created_at: string;
  updated_at: string;
  verification_status: "passed" | "warnings" | "failed" | "unchecked";
  metadata: Record<string, string>;
  deleted: boolean;
}

export interface PromptVersionRecord {
  prompt_id: string;
  version: string;
  content: string;
  author: string;
  changelog_summary: string;
  version_bump_type: string;
  created_at: string;
}

export type CreatePromptInput = z.infer<typeof createPromptSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
export type ListPromptsQuery = z.infer<typeof listPromptsQuerySchema>;
