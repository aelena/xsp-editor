import { z } from "zod";

export const createTagSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, {
      message:
        "Tag name must be lowercase, start with a letter, and contain only letters, numbers, and underscores",
    }),
  purpose: z.string().min(1).max(1000),
  use_when: z.string().min(1).max(1000),
  example: z.string().max(2000).optional().default(""),
  enforcement: z
    .enum(["required", "recommended", "optional", "deprecated"])
    .optional()
    .default("optional"),
});

export const updateTagSchema = z.object({
  purpose: z.string().min(1).max(1000).optional(),
  use_when: z.string().min(1).max(1000).optional(),
  example: z.string().max(2000).optional(),
  enforcement: z
    .enum(["required", "recommended", "optional", "deprecated"])
    .optional(),
});

export const listTagsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  search: z.string().optional(),
  enforcement: z
    .enum(["required", "recommended", "optional", "deprecated"])
    .optional(),
});

export interface TagRecord {
  name: string;
  purpose: string;
  use_when: string;
  example: string;
  enforcement: "required" | "recommended" | "optional" | "deprecated";
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
