import { z } from "zod";

export const createConstraintSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z][A-Z0-9]*-\d+$/, {
      message:
        "Constraint ID must be uppercase letters followed by a dash and digits (e.g., MED-001)",
    }),
  description: z.string().min(1).max(2000),
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum([
    "content",
    "safety",
    "style",
    "structural",
    "evidence",
    "output",
  ]),
  owner: z.string().max(200).optional().default(""),
  status: z
    .enum(["active", "deprecated", "retired"])
    .optional()
    .default("active"),
  xml_block: z.string().min(1).max(10000),
});

export const updateConstraintSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  category: z
    .enum(["content", "safety", "style", "structural", "evidence", "output"])
    .optional(),
  owner: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "deprecated", "retired"]).optional(),
  xml_block: z.string().min(1).max(10000).optional(),
});

export const listConstraintsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  category: z
    .enum(["content", "safety", "style", "structural", "evidence", "output"])
    .optional(),
  status: z.enum(["active", "deprecated", "retired"]).optional(),
});

export interface ConstraintRecord {
  id: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "content"
    | "safety"
    | "style"
    | "structural"
    | "evidence"
    | "output";
  owner: string;
  status: "active" | "deprecated" | "retired";
  xml_block: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export type CreateConstraintInput = z.infer<typeof createConstraintSchema>;
export type UpdateConstraintInput = z.infer<typeof updateConstraintSchema>;
