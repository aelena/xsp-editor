import type { PromptRecord, PromptVersionRecord } from "../schemas/prompts.js";
import type { TagRecord } from "../schemas/tags.js";
import type { ConstraintRecord } from "../schemas/constraints.js";
import type { TemplateRecord } from "../schemas/templates.js";

export interface ListConstraintsOptions {
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

export interface ListPromptsOptions {
  page: number;
  limit: number;
  search?: string;
  author?: string;
  tag?: string;
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
  listTags(): Promise<TagRecord[]>;
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
  ): Promise<ConstraintRecord[]>;
  deleteConstraint(id: string): Promise<void>;

  // Template CRUD (Table Storage)
  createTemplate(template: TemplateRecord): Promise<void>;
  getTemplate(name: string): Promise<TemplateRecord | null>;
  updateTemplate(name: string, updates: Partial<TemplateRecord>): Promise<void>;
  listTemplates(): Promise<TemplateRecord[]>;
  deleteTemplate(name: string): Promise<void>;
}
