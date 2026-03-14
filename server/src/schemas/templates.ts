import { z } from "zod";

export interface TemplateRecord {
  name: string;
  description: string;
  content: string;
  category: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
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
});

export const updateTemplateSchema = z.object({
  description: z.string().min(1).max(1000).optional(),
  content: z.string().min(1).max(50000).optional(),
  category: z.string().min(1).max(100).optional(),
});
