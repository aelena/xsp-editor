import type {
  StorageAdapter,
  ListPromptsOptions,
  ListPromptsResult,
  ListConstraintsOptions,
  ListTagsOptions,
  PaginatedResult,
} from "./adapter.js";
import type { PromptRecord, PromptVersionRecord } from "../schemas/prompts.js";
import type { TagRecord } from "../schemas/tags.js";
import type { ConstraintRecord } from "../schemas/constraints.js";
import type { TemplateRecord } from "../schemas/templates.js";

export class MemoryStorageAdapter implements StorageAdapter {
  private prompts = new Map<string, PromptRecord>();
  private versions = new Map<string, PromptVersionRecord[]>();
  private tags = new Map<string, TagRecord>();
  private constraints = new Map<string, ConstraintRecord>();
  private templates = new Map<string, TemplateRecord>();

  async createPrompt(prompt: PromptRecord): Promise<void> {
    this.prompts.set(prompt.id, { ...prompt });
  }

  async getPrompt(id: string): Promise<PromptRecord | null> {
    const prompt = this.prompts.get(id);
    if (!prompt || prompt.deleted) return null;
    return { ...prompt };
  }

  async updatePrompt(
    id: string,
    updates: Partial<PromptRecord>,
  ): Promise<void> {
    const existing = this.prompts.get(id);
    if (!existing) throw new Error(`Prompt ${id} not found`);
    this.prompts.set(id, { ...existing, ...updates });
  }

  async listPrompts(options: ListPromptsOptions): Promise<ListPromptsResult> {
    let results = Array.from(this.prompts.values()).filter((p) => !p.deleted);

    if (options.search) {
      const search = options.search.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search),
      );
    }

    if (options.author) {
      results = results.filter((p) => p.author === options.author);
    }

    if (options.tag) {
      results = results.filter((p) => p.tags_used.includes(options.tag!));
    }

    // Sort by updated_at descending
    results.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    const total = results.length;
    const start = (options.page - 1) * options.limit;
    const paged = results.slice(start, start + options.limit);

    return {
      prompts: paged.map((p) => ({ ...p })),
      total,
      page: options.page,
      limit: options.limit,
    };
  }

  async deletePrompt(id: string): Promise<void> {
    const existing = this.prompts.get(id);
    if (!existing) throw new Error(`Prompt ${id} not found`);
    this.prompts.set(id, { ...existing, deleted: true });
  }

  async saveVersion(version: PromptVersionRecord): Promise<void> {
    const key = version.prompt_id;
    const existing = this.versions.get(key) || [];
    existing.push({ ...version });
    this.versions.set(key, existing);
  }

  async getVersion(
    promptId: string,
    version: string,
  ): Promise<PromptVersionRecord | null> {
    const versions = this.versions.get(promptId) || [];
    const found = versions.find((v) => v.version === version);
    return found ? { ...found } : null;
  }

  async listVersions(promptId: string): Promise<PromptVersionRecord[]> {
    const versions = this.versions.get(promptId) || [];
    return versions.map((v) => ({ ...v }));
  }

  // Tag CRUD
  async createTag(tag: TagRecord): Promise<void> {
    this.tags.set(tag.name, { ...tag });
  }

  async getTag(name: string): Promise<TagRecord | null> {
    const tag = this.tags.get(name);
    return tag ? { ...tag } : null;
  }

  async updateTag(name: string, updates: Partial<TagRecord>): Promise<void> {
    const existing = this.tags.get(name);
    if (!existing) throw new Error(`Tag ${name} not found`);
    this.tags.set(name, { ...existing, ...updates });
  }

  async listTags(options?: ListTagsOptions): Promise<PaginatedResult<TagRecord>> {
    let results = Array.from(this.tags.values());

    if (options?.search) {
      const search = options.search.toLowerCase();
      results = results.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.purpose.toLowerCase().includes(search),
      );
    }

    if (options?.enforcement) {
      results = results.filter((t) => t.enforcement === options.enforcement);
    }

    results.sort((a, b) => a.name.localeCompare(b.name));

    const total = results.length;
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;
    const start = (page - 1) * limit;
    const paged = results.slice(start, start + limit);

    return {
      items: paged.map((t) => ({ ...t })),
      total,
      page,
      limit,
    };
  }

  async deleteTag(name: string): Promise<void> {
    this.tags.delete(name);
  }

  // Constraint CRUD
  async createConstraint(constraint: ConstraintRecord): Promise<void> {
    this.constraints.set(constraint.id, { ...constraint });
  }

  async getConstraint(id: string): Promise<ConstraintRecord | null> {
    const constraint = this.constraints.get(id);
    return constraint ? { ...constraint } : null;
  }

  async updateConstraint(
    id: string,
    updates: Partial<ConstraintRecord>,
  ): Promise<void> {
    const existing = this.constraints.get(id);
    if (!existing) throw new Error(`Constraint ${id} not found`);
    this.constraints.set(id, { ...existing, ...updates });
  }

  async listConstraints(
    options?: ListConstraintsOptions,
  ): Promise<PaginatedResult<ConstraintRecord>> {
    let results = Array.from(this.constraints.values());

    if (options?.severity) {
      results = results.filter((c) => c.severity === options.severity);
    }
    if (options?.category) {
      results = results.filter((c) => c.category === options.category);
    }
    if (options?.status) {
      results = results.filter((c) => c.status === options.status);
    }

    results.sort((a, b) => a.id.localeCompare(b.id));

    const total = results.length;
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;
    const start = (page - 1) * limit;
    const paged = results.slice(start, start + limit);

    return {
      items: paged.map((c) => ({ ...c })),
      total,
      page,
      limit,
    };
  }

  async deleteConstraint(id: string): Promise<void> {
    this.constraints.delete(id);
  }

  // Template CRUD
  async createTemplate(template: TemplateRecord): Promise<void> {
    this.templates.set(template.name, { ...template });
  }

  async getTemplate(name: string): Promise<TemplateRecord | null> {
    const template = this.templates.get(name);
    return template ? { ...template } : null;
  }

  async updateTemplate(name: string, updates: Partial<TemplateRecord>): Promise<void> {
    const existing = this.templates.get(name);
    if (!existing) throw new Error(`Template ${name} not found`);
    this.templates.set(name, { ...existing, ...updates });
  }

  async listTemplates(): Promise<TemplateRecord[]> {
    return Array.from(this.templates.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ ...t }));
  }

  async deleteTemplate(name: string): Promise<void> {
    this.templates.delete(name);
  }

  // Test helper
  clear(): void {
    this.prompts.clear();
    this.versions.clear();
    this.tags.clear();
    this.constraints.clear();
    this.templates.clear();
  }
}
