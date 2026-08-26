import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from "../schemas/templates.js";
import { nameParamSchema } from "../schemas/params.js";
import { initialMembership } from "../services/membership.js";
import { incrementVersion } from "../services/versioning.js";
import type { TemplateVersionRecord } from "../schemas/templates.js";

export function registerTemplateRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
): void {
  // List all templates
  app.get("/api/v1/templates", async (request, reply) => {
    const parsed = listTemplatesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query parameters" });
    }
    // Archived templates are excluded unless asked for, the same as prompts.
    const templates = await storage.listTemplates(parsed.data);
    return reply.send({ templates });
  });

  // Get single template
  app.get("/api/v1/templates/:name", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid template name", details: paramResult.error.issues });
    }
    const { name } = paramResult.data;
    const template = await storage.getTemplate(name);
    if (!template) {
      return reply.status(404).send({ error: `Template '${name}' not found` });
    }
    return reply.send(template);
  });

  // Create template
  app.post("/api/v1/templates", async (request, reply) => {
    const parseResult = createTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { name, description, content, category, project_id } = parseResult.data;

    const existing = await storage.getTemplate(name);
    if (existing) {
      return reply
        .status(409)
        .send({ error: `Template '${name}' already exists` });
    }

    const now = new Date().toISOString();
    const template = {
      name,
      description,
      content,
      category,
      version: "1.0.0",
      is_builtin: false,
      created_at: now,
      updated_at: now,
      projects: initialMembership(project_id),
    };

    await storage.createTemplate(template);
    // Recorded at creation, so the history starts complete. Beginning it at the
    // first edit means the original is the one version you cannot get back.
    await storage.saveTemplateVersion({
      template_name: template.name,
      version: template.version,
      content: template.content,
      description: template.description,
      category: template.category,
      author: "local user",
      changelog_summary: "Initial version",
      version_bump_type: "major",
      created_at: now,
    });
    return reply.status(201).send(template);
  });

  // Update template
  app.put("/api/v1/templates/:name", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid template name", details: paramResult.error.issues });
    }
    const { name } = paramResult.data;
    const parseResult = updateTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const existing = await storage.getTemplate(name);
    if (!existing) {
      return reply.status(404).send({ error: `Template '${name}' not found` });
    }

    if (existing.is_builtin) {
      // A built-in is the shipped vocabulary. Editing one in place would mean
      // an upgrade either clobbers the edit or silently keeps the old copy, and
      // neither is a thing to discover later. Forking is the supported route.
      return reply.status(409).send({
        error: "Built-in templates cannot be edited. Fork it and edit the copy.",
      });
    }

    const { version_bump, changelog_summary, author, ...fields } = parseResult.data;
    const now = new Date().toISOString();

    // Content, description and category are what a version captures, so a
    // change to any of them earns one. A request that changes none of them is a
    // no-op rather than a new version of the same thing.
    const changed = (["content", "description", "category"] as const).some(
      (key) => fields[key] !== undefined && fields[key] !== existing[key],
    );

    if (!changed) {
      return reply.send(existing);
    }

    const version = incrementVersion(existing.version, version_bump);
    const next = { ...existing, ...fields, version, updated_at: now };

    await storage.updateTemplate(name, { ...fields, version, updated_at: now });
    await storage.saveTemplateVersion({
      template_name: name,
      version,
      content: next.content,
      description: next.description,
      category: next.category,
      author: author ?? "local user",
      changelog_summary: changelog_summary ?? "",
      version_bump_type: version_bump,
      created_at: now,
    });

    return reply.send(await storage.getTemplate(name));
  });

  /** The changelog. Same shape as a prompt's, so the client reuses the view. */
  app.get("/api/v1/templates/:name/versions", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid template name" });
    }
    const { name } = paramResult.data;
    if (!(await storage.getTemplate(name))) {
      return reply.status(404).send({ error: `Template '${name}' not found` });
    }
    return reply.send({
      template_name: name,
      versions: await storage.listTemplateVersions(name),
    });
  });

  app.get("/api/v1/templates/:name/versions/:ver", async (request, reply) => {
    const { name, ver } = request.params as { name: string; ver: string };
    const version = await storage.getTemplateVersion(name, ver);
    if (!version) return reply.status(404).send({ error: "Version not found" });
    return reply.send(version);
  });

  /**
   * Roll back to an earlier version.
   *
   * Forward, not backward: it writes the old content as a new version rather
   * than deleting what came after. A rollback that erases history is a rollback
   * you cannot undo, and the reason for keeping versions was to be able to.
   */
  app.post("/api/v1/templates/:name/rollback", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid template name" });
    }
    const { name } = paramResult.data;
    const existing = await storage.getTemplate(name);
    if (!existing) {
      return reply.status(404).send({ error: `Template '${name}' not found` });
    }
    if (existing.is_builtin) {
      return reply.status(409).send({ error: "Built-in templates have no edits to roll back" });
    }

    const body = request.body as { version?: string };
    if (!body?.version) {
      return reply.status(400).send({ error: "version is required in the body" });
    }

    const target = await storage.getTemplateVersion(name, body.version);
    if (!target) return reply.status(404).send({ error: "Target version not found" });

    const now = new Date().toISOString();
    const version = incrementVersion(existing.version, "patch");
    const restored: TemplateVersionRecord = {
      template_name: name,
      version,
      content: target.content,
      description: target.description,
      category: target.category,
      author: "local user",
      changelog_summary: `Rolled back to ${target.version}`,
      version_bump_type: "patch",
      created_at: now,
    };

    await storage.updateTemplate(name, {
      content: target.content,
      description: target.description,
      category: target.category,
      version,
      updated_at: now,
    });
    await storage.saveTemplateVersion(restored);

    return reply.send(await storage.getTemplate(name));
  });

  // Delete template
  app.delete("/api/v1/templates/:name", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid template name", details: paramResult.error.issues });
    }
    const { name } = paramResult.data;
    const existing = await storage.getTemplate(name);
    if (!existing) {
      return reply.status(404).send({ error: `Template '${name}' not found` });
    }
    await storage.deleteTemplate(name);
    return reply.status(204).send();
  });
}
