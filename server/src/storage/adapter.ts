import type { PromptRecord, PromptVersionRecord } from "../schemas/prompts.js";
import type { TagRecord } from "../schemas/tags.js";

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
}
