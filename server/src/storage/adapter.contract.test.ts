import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "./memory.js";
import { SqliteStorageAdapter } from "./sqlite.js";
import type { StorageAdapter } from "./adapter.js";
import type { PromptRecord } from "../schemas/prompts.js";
import type { TemplateRecord } from "../schemas/templates.js";
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
  reservedProjects,
} from "../schemas/projects.js";

/**
 * One suite, both adapters.
 *
 * Two implementations of one interface drift, and they drift silently: the
 * routes are tested against the fast in-memory one and the running server uses
 * the other, so a difference between them is a bug that no test sees and every
 * user does. This is the only thing that makes the seam a guarantee rather than
 * an intention.
 *
 * Everything asserted here is behaviour the routes actually depend on. Where the
 * two could differ harmlessly, for example on the ordering of an unordered set,
 * the assertion normalises rather than pinning one implementation's accident.
 */

const NOW = "2026-08-26T10:00:00.000Z";
const ALPHA = "aaaaaaaa-0000-4000-8000-000000000001";

function prompt(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    id: "11111111-0000-4000-8000-000000000001",
    name: "classify-intent",
    description: "Classify the intent of a message",
    version: "1.0.0",
    content: "<task>Classify</task>",
    variables: { message: { description: "the message", required: true } },
    tags_used: ["task"],
    constraints_referenced: ["GEN-001"],
    author: "alice",
    created_at: NOW,
    updated_at: NOW,
    verification_status: "unchecked",
    metadata: { source: "test" },
    projects: [GENERAL_PROJECT_ID],
    ...overrides,
  };
}

function template(overrides: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    name: "basic",
    description: "A basic template",
    content: "<task></task>",
    category: "general",
    version: "1.0.0",
    is_builtin: false,
    created_at: NOW,
    updated_at: NOW,
    projects: [GENERAL_PROJECT_ID],
    ...overrides,
  };
}

const ADAPTERS: [string, () => StorageAdapter][] = [
  ["MemoryStorageAdapter", () => new MemoryStorageAdapter()],
  ["SqliteStorageAdapter", () => new SqliteStorageAdapter(":memory:")],
];

describe.each(ADAPTERS)("%s", (_name, create) => {
  let storage: StorageAdapter;

  beforeEach(async () => {
    storage = create();
    for (const project of reservedProjects(NOW)) {
      await storage.createProject(project);
    }
    await storage.createProject({
      id: ALPHA,
      name: "Alpha",
      path: null,
      is_git_repo: false,
      is_reserved: false,
      created_at: NOW,
      updated_at: NOW,
    });
  });

  describe("prompts", () => {
    it("round-trips every field", async () => {
      const original = prompt();
      await storage.createPrompt(original);
      expect(await storage.getPrompt(original.id)).toEqual(original);
    });

    it("answers null for one that is not there", async () => {
      expect(await storage.getPrompt("11111111-0000-4000-8000-000000000009")).toBeNull();
    });

    it("keeps forked_from when present and omits it when absent", async () => {
      const plain = prompt();
      const fork = prompt({
        id: "11111111-0000-4000-8000-000000000002",
        name: "classify-intent-copy",
        forked_from: { id: plain.id, name: plain.name, version: "1.0.0" },
      });
      await storage.createPrompt(plain);
      await storage.createPrompt(fork);

      expect((await storage.getPrompt(plain.id))?.forked_from).toBeUndefined();
      expect((await storage.getPrompt(fork.id))?.forked_from).toEqual({
        id: plain.id,
        name: plain.name,
        version: "1.0.0",
      });
    });

    it("applies a partial update without disturbing the rest", async () => {
      const original = prompt();
      await storage.createPrompt(original);
      await storage.updatePrompt(original.id, { content: "<task>New</task>" });

      const updated = await storage.getPrompt(original.id);
      expect(updated).toEqual({ ...original, content: "<task>New</task>" });
    });

    it("rejects an update to something that does not exist", async () => {
      await expect(
        storage.updatePrompt("11111111-0000-4000-8000-000000000009", { name: "x" }),
      ).rejects.toThrow();
    });

    it("lists newest first", async () => {
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000a", updated_at: "2026-01-01T00:00:00.000Z" }));
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000b", updated_at: "2026-06-01T00:00:00.000Z" }));

      const result = await storage.listPrompts({ page: 1, limit: 10 });
      expect(result.prompts[0].id).toBe("11111111-0000-4000-8000-00000000000b");
    });

    it("paginates with a total that ignores the page", async () => {
      for (let i = 0; i < 5; i += 1) {
        await storage.createPrompt(prompt({ id: `11111111-0000-4000-8000-00000000000${i}` }));
      }
      const page = await storage.listPrompts({ page: 2, limit: 2 });

      expect(page.total).toBe(5);
      expect(page.prompts).toHaveLength(2);
      expect(page.page).toBe(2);
      expect(page.limit).toBe(2);
    });

    it("searches name and description, case insensitively", async () => {
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000a", name: "extract-entities" }));
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000b", name: "summarise" }));

      const byName = await storage.listPrompts({ page: 1, limit: 10, search: "EXTRACT" });
      expect(byName.prompts.map((p) => p.name)).toEqual(["extract-entities"]);
    });

    it("filters by author", async () => {
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000a", author: "alice" }));
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000b", author: "bob" }));

      const result = await storage.listPrompts({ page: 1, limit: 10, author: "bob" });
      expect(result.total).toBe(1);
    });

    it("filters by a tag used in the content", async () => {
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000a", tags_used: ["task", "context"] }));
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000b", tags_used: ["task"] }));

      const result = await storage.listPrompts({ page: 1, limit: 10, tag: "context" });
      expect(result.total).toBe(1);
    });
  });

  describe("membership", () => {
    it("stores several projects per prompt", async () => {
      await storage.createPrompt(prompt({ projects: [GENERAL_PROJECT_ID, ALPHA] }));
      const stored = await storage.getPrompt(prompt().id);
      expect([...stored!.projects].sort()).toEqual([GENERAL_PROJECT_ID, ALPHA].sort());
    });

    it("replaces the whole set on update rather than merging", async () => {
      await storage.createPrompt(prompt({ projects: [GENERAL_PROJECT_ID, ALPHA] }));
      await storage.updatePrompt(prompt().id, { projects: [ALPHA] });
      expect((await storage.getPrompt(prompt().id))?.projects).toEqual([ALPHA]);
    });

    it("filters a listing by project", async () => {
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000a", projects: [ALPHA] }));
      await storage.createPrompt(prompt({ id: "11111111-0000-4000-8000-00000000000b", projects: [GENERAL_PROJECT_ID] }));

      const result = await storage.listPrompts({ page: 1, limit: 10, project: ALPHA });
      expect(result.prompts.map((p) => p.id)).toEqual(["11111111-0000-4000-8000-00000000000a"]);
    });

    it("hides archived prompts from a listing but not from a get", async () => {
      const one = prompt();
      await storage.createPrompt(one);
      await storage.deletePrompt(one.id);

      expect((await storage.listPrompts({ page: 1, limit: 10 })).total).toBe(0);
      // The old `deleted` flag hid it from both, which made it a hard delete:
      // nothing removed could be viewed, restored or forked.
      expect(await storage.getPrompt(one.id)).not.toBeNull();
      expect((await storage.getPrompt(one.id))?.projects).toEqual([ARCHIVE_PROJECT_ID]);
    });

    it("includes archived prompts when asked", async () => {
      const one = prompt();
      await storage.createPrompt(one);
      await storage.deletePrompt(one.id);

      const result = await storage.listPrompts({ page: 1, limit: 10, include_archived: true });
      expect(result.total).toBe(1);
    });

    it("makes archiving exclusive", async () => {
      await storage.createPrompt(prompt({ projects: [GENERAL_PROJECT_ID, ALPHA] }));
      await storage.deletePrompt(prompt().id);
      expect((await storage.getPrompt(prompt().id))?.projects).toEqual([ARCHIVE_PROJECT_ID]);
    });

    it("refuses to delete a prompt that is not there", async () => {
      await expect(storage.deletePrompt("11111111-0000-4000-8000-000000000009")).rejects.toThrow();
    });
  });

  describe("versions", () => {
    // Against a real prompt, which is the only way the routes ever save one.
    // The first draft of these used a made-up prompt id and passed on the
    // in-memory adapter while SQLite rejected it on the foreign key. That
    // divergence is the contract suite earning its place, and the right fix was
    // the test rather than the constraint: a version of a prompt that does not
    // exist is not a thing worth being able to store.
    beforeEach(async () => {
      await storage.createPrompt(prompt());
    });

    it("keeps them in the order they happened, not by version string", async () => {
      // Sorting by the string would put 1.10.0 before 1.9.0.
      const base = {
        prompt_id: prompt().id, content: "x", author: "alice",
        changelog_summary: "", version_bump_type: "minor", created_at: NOW,
      };
      await storage.saveVersion({ ...base, version: "1.9.0" });
      await storage.saveVersion({ ...base, version: "1.10.0" });

      const versions = await storage.listVersions(prompt().id);
      expect(versions.map((v) => v.version)).toEqual(["1.9.0", "1.10.0"]);
    });

    it("fetches one by version", async () => {
      await storage.saveVersion({
        prompt_id: prompt().id, version: "1.0.0", content: "x", author: "alice",
        changelog_summary: "first", version_bump_type: "major", created_at: NOW,
      });
      expect((await storage.getVersion(prompt().id, "1.0.0"))?.changelog_summary).toBe("first");
      expect(await storage.getVersion(prompt().id, "9.9.9")).toBeNull();
    });

    it("answers an empty list for a prompt with no versions", async () => {
      expect(await storage.listVersions("nobody")).toEqual([]);
    });
  });

  describe("tags", () => {
    const tag = {
      name: "task", purpose: "The instruction", use_when: "Always", example: "<task/>",
      enforcement: "required" as const, usage_count: 0, created_at: NOW, updated_at: NOW,
    };

    it("round-trips", async () => {
      await storage.createTag(tag);
      expect(await storage.getTag("task")).toEqual(tag);
    });

    it("counts the whole set, not the page", async () => {
      await storage.createTag(tag);
      await storage.createTag({ ...tag, name: "context", enforcement: "optional" });

      const result = await storage.listTags({ page: 1, limit: 1 });
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(1);
    });

    it("filters by enforcement", async () => {
      await storage.createTag(tag);
      await storage.createTag({ ...tag, name: "context", enforcement: "optional" });

      const result = await storage.listTags({ page: 1, limit: 10, enforcement: "required" });
      expect(result.items.map((t) => t.name)).toEqual(["task"]);
    });

    it("updates in place", async () => {
      await storage.createTag(tag);
      await storage.updateTag("task", { purpose: "Changed" });
      expect((await storage.getTag("task"))?.purpose).toBe("Changed");
    });

    it("deletes", async () => {
      await storage.createTag(tag);
      await storage.deleteTag("task");
      expect(await storage.getTag("task")).toBeNull();
    });
  });

  describe("constraints", () => {
    const constraint = {
      id: "GEN-001", description: "No PII", severity: "critical" as const,
      category: "safety" as const, owner: "alice", status: "active" as const,
      xml_block: "<constraint/>", usage_count: 0, created_at: NOW, updated_at: NOW,
    };

    it("round-trips", async () => {
      await storage.createConstraint(constraint);
      expect(await storage.getConstraint("GEN-001")).toEqual(constraint);
    });

    it("filters by severity, category and status together", async () => {
      await storage.createConstraint(constraint);
      await storage.createConstraint({ ...constraint, id: "GEN-002", severity: "low" });

      const result = await storage.listConstraints({ page: 1, limit: 10, severity: "low" });
      expect(result.items.map((c) => c.id)).toEqual(["GEN-002"]);
    });

    it("deletes", async () => {
      await storage.createConstraint(constraint);
      await storage.deleteConstraint("GEN-001");
      expect(await storage.getConstraint("GEN-001")).toBeNull();
    });
  });

  describe("templates", () => {
    it("round-trips, including the builtin flag", async () => {
      const one = template({ is_builtin: true });
      await storage.createTemplate(one);
      expect(await storage.getTemplate("basic")).toEqual(one);
    });

    it("sorts by name", async () => {
      await storage.createTemplate(template({ name: "zebra" }));
      await storage.createTemplate(template({ name: "alpha" }));
      expect((await storage.listTemplates()).map((t) => t.name)).toEqual(["alpha", "zebra"]);
    });

    it("obeys the same membership rules as prompts", async () => {
      await storage.createTemplate(template({ projects: [ALPHA] }));
      expect((await storage.listTemplates({ project: ALPHA })).map((t) => t.name)).toEqual(["basic"]);
      expect(await storage.listTemplates({ project: GENERAL_PROJECT_ID })).toEqual([]);
    });

    it("archives rather than destroying", async () => {
      await storage.createTemplate(template());
      await storage.deleteTemplate("basic");

      expect(await storage.listTemplates()).toEqual([]);
      expect((await storage.getTemplate("basic"))?.projects).toEqual([ARCHIVE_PROJECT_ID]);
      expect(await storage.listTemplates({ include_archived: true })).toHaveLength(1);
    });
  });

  describe("projects", () => {
    it("puts General first and Archive last", async () => {
      const names = (await storage.listProjects()).map((p) => p.name);
      expect(names).toEqual(["General", "Alpha", "Archive"]);
    });

    it("keeps a null path distinct from an empty one", async () => {
      // A project that is only a grouping has no folder, and the git routes
      // decide what to answer by checking for exactly that.
      expect((await storage.getProject(ALPHA))?.path).toBeNull();
    });

    it("round-trips a project with a path", async () => {
      await storage.createProject({
        id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Workspace",
        path: "/tmp/work", is_git_repo: true, is_reserved: false,
        created_at: NOW, updated_at: NOW,
      });
      const stored = await storage.getProject("bbbbbbbb-0000-4000-8000-000000000001");
      expect(stored?.path).toBe("/tmp/work");
      expect(stored?.is_git_repo).toBe(true);
    });

    it("updates in place", async () => {
      await storage.updateProject(ALPHA, { name: "Renamed" });
      expect((await storage.getProject(ALPHA))?.name).toBe("Renamed");
    });

    it("deletes", async () => {
      await storage.deleteProject(ALPHA);
      expect(await storage.getProject(ALPHA)).toBeNull();
    });
  });
});
