import type {
  StorageAdapter,
  ListPromptsOptions,
  ListPromptsResult,
} from "./adapter.js";
import type { PromptRecord, PromptVersionRecord } from "../schemas/prompts.js";

export class MemoryStorageAdapter implements StorageAdapter {
  private prompts = new Map<string, PromptRecord>();
  private versions = new Map<string, PromptVersionRecord[]>();

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

  // Test helper
  clear(): void {
    this.prompts.clear();
    this.versions.clear();
  }
}
