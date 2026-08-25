import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from "../schemas/templates.js";
import { nameParamSchema } from "../schemas/params.js";
import { initialMembership } from "../services/membership.js";

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
      is_builtin: false,
      created_at: now,
      updated_at: now,
      projects: initialMembership(project_id),
    };

    await storage.createTemplate(template);
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

    const updates = {
      ...parseResult.data,
      updated_at: new Date().toISOString(),
    };

    await storage.updateTemplate(name, updates);
    const updated = await storage.getTemplate(name);
    return reply.send(updated);
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
