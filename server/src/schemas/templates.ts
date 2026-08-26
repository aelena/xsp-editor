import { z } from "zod";
import { booleanQuery } from "./query.js";

export interface TemplateRecord {
  name: string;
  description: string;
  content: string;
  category: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
  /** Same membership rules as a prompt. Never empty. */
  projects: string[];
  forked_from?: { id: string; name: string; version: string };
}

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Lowercase alphanumeric with hyphens only"),
  description: z.string().min(1).max(1000),
  content: z.string().min(1).max(50000),
  category: z.string().min(1).max(100).default("general"),
  /** Which project to create it in. Omitted means General. */
  project_id: z.string().min(1).optional(),
});

export const listTemplatesQuerySchema = z.object({
  project: z.string().optional(),
  include_archived: booleanQuery,
});

export const updateTemplateSchema = z.object({
  description: z.string().min(1).max(1000).optional(),
  content: z.string().min(1).max(50000).optional(),
  category: z.string().min(1).max(100).optional(),
});
