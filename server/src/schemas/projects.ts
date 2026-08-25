import { z } from "zod";

/**
 * A project is a logical grouping. Membership is a set of project ids held on
 * the artifact; it never means "a file exists in that directory".
 *
 * A project may additionally have a `path`, which makes it a workspace you can
 * browse and commit. The two are independent: a path does not imply members and
 * members do not imply files. That is the point, because two representations of
 * the same fact are two things that can disagree.
 */
export interface ProjectRecord {
  id: string;
  name: string;
  /** Null for a pure grouping. A string makes this a workspace on disk too. */
  path: string | null;
  is_git_repo: boolean;
  /** Reserved projects cannot be renamed or deleted. */
  is_reserved: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Fixed ids, so membership survives a rename and so the audit trail stays
 * readable. They are real UUIDs rather than the slugs they read as, because
 * every `:id` route validates a UUID: the seeder once wrote slug ids and every
 * detail request answered 400 while the listing happily showed them.
 */
export const GENERAL_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
export const ARCHIVE_PROJECT_ID = "00000000-0000-4000-8000-000000000002";

export const RESERVED_PROJECT_IDS: readonly string[] = [
  GENERAL_PROJECT_ID,
  ARCHIVE_PROJECT_ID,
];

export function isReservedProjectId(id: string): boolean {
  return RESERVED_PROJECT_IDS.includes(id);
}

/** The two reserved projects, as the seeder creates them. */
export function reservedProjects(now: string): ProjectRecord[] {
  return [
    {
      id: GENERAL_PROJECT_ID,
      name: "General",
      path: null,
      is_git_repo: false,
      is_reserved: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: ARCHIVE_PROJECT_ID,
      name: "Archive",
      path: null,
      is_git_repo: false,
      is_reserved: true,
      created_at: now,
      updated_at: now,
    },
  ];
}

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  // Optional, because a project can be nothing but a grouping.
  path: z.string().min(1).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  path: z.string().min(1).optional(),
});

/**
 * What to do with the members a project deletion would leave with no project.
 * There is no default: the server refuses to guess rather than let a client
 * archive things by forgetting a query parameter.
 */
export const deleteProjectQuerySchema = z.object({
  orphans: z.enum(["archive", "general"]).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
