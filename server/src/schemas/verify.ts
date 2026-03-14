import { z } from "zod";

export const verifyRequestSchema = z.object({
  content: z.string().min(1),
  variables: z
    .record(
      z.string(),
      z.object({
        description: z.string(),
        required: z.boolean().optional(),
      }),
    )
    .optional()
    .default({}),
});

export type VerifyRequestInput = z.infer<typeof verifyRequestSchema>;

export const verifyFixRequestSchema = z.object({
  content: z.string().min(1),
  rule: z.string(),
  message: z.string(),
  variables: z
    .record(
      z.string(),
      z.object({
        description: z.string(),
        required: z.boolean().optional(),
      }),
    )
    .optional()
    .default({}),
});

export type VerifyFixRequestInput = z.infer<typeof verifyFixRequestSchema>;
