import type { PromptRecord, PromptVersionRecord } from "../schemas/prompts.js";
import type { TagRecord } from "../schemas/tags.js";
import type { ConstraintRecord } from "../schemas/constraints.js";
import type { TemplateRecord } from "../schemas/templates.js";
import type { ProjectRecord } from "../schemas/projects.js";

export interface ListConstraintsOptions {
  page: number;
  limit: number;
  severity?: "critical" | "high" | "medium" | "low";
  category?:
    | "content"
    | "safety"
    | "style"
    | "structural"
    | "evidence"
    | "output";
  status?: "active" | "deprecated" | "retired";
}

export interface ListTagsOptions {
  page: number;
  limit: number;
  search?: string;
  enforcement?: "required" | "recommended" | "optional" | "deprecated";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ListPromptsOptions {
  page: number;
  limit: number;
  search?: string;
  author?: string;
  tag?: string;
  /** Only prompts belonging to this project id. */
  project?: string;
  /**
   * Archived prompts are excluded by default, which is what replaced the old
   * `deleted` filter. Opting in is how the Archive view is built, rather than
   * having a second listing method that differs by one predicate.
   */
  include_archived?: boolean;
}

export interface ListPromptsResult {
  prompts: PromptRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface StorageAdapter {
  // Prompt CRUD (Table Storage)
  createPrompt(prompt: PromptRecord): Promise<void>;
  getPrompt(id: string): Promise<PromptRecord | null>;
  updatePrompt(id: string, updates: Partial<PromptRecord>): Promise<void>;
  listPrompts(options: ListPromptsOptions): Promise<ListPromptsResult>;
  deletePrompt(id: string): Promise<void>;

  // Prompt Versions (Blob Storage)
  saveVersion(version: PromptVersionRecord): Promise<void>;
  getVersion(promptId: string, version: string): Promise<PromptVersionRecord | null>;
  listVersions(promptId: string): Promise<PromptVersionRecord[]>;

  // Tag CRUD (Table Storage)
  createTag(tag: TagRecord): Promise<void>;
  getTag(name: string): Promise<TagRecord | null>;
  updateTag(name: string, updates: Partial<TagRecord>): Promise<void>;
  listTags(options?: ListTagsOptions): Promise<PaginatedResult<TagRecord>>;
  deleteTag(name: string): Promise<void>;

  // Constraint CRUD (Table Storage)
  createConstraint(constraint: ConstraintRecord): Promise<void>;
  getConstraint(id: string): Promise<ConstraintRecord | null>;
  updateConstraint(
    id: string,
    updates: Partial<ConstraintRecord>,
  ): Promise<void>;
  listConstraints(
    options?: ListConstraintsOptions,
  ): Promise<PaginatedResult<ConstraintRecord>>;
  deleteConstraint(id: string): Promise<void>;

  // Projects: a logical grouping, optionally also a folder on disk.
  //
  // These used to live in a module-level Map inside routes/projects.ts, which
  // meant the registry was global mutable state owned by a route file and
  // impossible to isolate between tests.
  createProject(project: ProjectRecord): Promise<void>;
  getProject(id: string): Promise<ProjectRecord | null>;
  updateProject(id: string, updates: Partial<ProjectRecord>): Promise<void>;
  listProjects(): Promise<ProjectRecord[]>;
  deleteProject(id: string): Promise<void>;

  // Template CRUD (Table Storage)
  createTemplate(template: TemplateRecord): Promise<void>;
  getTemplate(name: string): Promise<TemplateRecord | null>;
  updateTemplate(name: string, updates: Partial<TemplateRecord>): Promise<void>;
  /** `project` filters by membership; templates are otherwise all returned. */
  listTemplates(options?: { project?: string; include_archived?: boolean }): Promise<TemplateRecord[]>;
  deleteTemplate(name: string): Promise<void>;
}
