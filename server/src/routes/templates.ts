import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "../storage/adapter.js";
import { createTemplateSchema, updateTemplateSchema } from "../schemas/templates.js";

export function registerTemplateRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
): void {
  // List all templates
  app.get("/api/v1/templates", async (_request, reply) => {
    const templates = await storage.listTemplates();
    return reply.send({ templates });
  });

  // Get single template
  app.get("/api/v1/templates/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
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

    const { name, description, content, category } = parseResult.data;

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
    };

    await storage.createTemplate(template);
    return reply.status(201).send(template);
  });

  // Update template
  app.put("/api/v1/templates/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
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
    const { name } = request.params as { name: string };
    const existing = await storage.getTemplate(name);
    if (!existing) {
      return reply.status(404).send({ error: `Template '${name}' not found` });
    }
    await storage.deleteTemplate(name);
    return reply.status(204).send();
  });
}
