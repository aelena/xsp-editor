import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  path: z.string().min(1),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  path: z.string().min(1).optional(),
});

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  is_git_repo: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
