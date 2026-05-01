import { z } from "zod";

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid UUID format"),
});

export const constraintIdParamSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[A-Z][A-Z0-9]*-\d+$/, "Invalid constraint ID format"),
});

export const nameParamSchema = z.object({
  name: z.string().min(1).max(200),
});

export const promptVersionParamSchema = z.object({
  id: z.string().uuid("Invalid UUID format"),
  ver: z.string().regex(/^\d+\.\d+\.\d+$/, "Invalid semver format"),
});
