import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "../storage/adapter.js";
import { createTagSchema, updateTagSchema, listTagsQuerySchema } from "../schemas/tags.js";
import { nameParamSchema } from "../schemas/params.js";

export function registerTagRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
): void {
  // List all tags
  app.get("/api/v1/tags", async (request, reply) => {
    const parseResult = listTagsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: parseResult.error.issues,
      });
    }

    const result = await storage.listTags(parseResult.data);
    return reply.send({ tags: result.items, total: result.total, page: result.page, limit: result.limit });
  });

  // Get a tag by name
  app.get("/api/v1/tags/:name", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid tag name", details: paramResult.error.issues });
    }
    const { name } = paramResult.data;
    const tag = await storage.getTag(name);
    if (!tag) {
      return reply.status(404).send({ error: "Tag not found" });
    }
    return reply.send(tag);
  });

  // Create a new tag
  app.post("/api/v1/tags", async (request, reply) => {
    const parseResult = createTagSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const input = parseResult.data;

    // Check if tag already exists
    const existing = await storage.getTag(input.name);
    if (existing) {
      return reply.status(409).send({ error: "Tag already exists" });
    }

    const now = new Date().toISOString();
    const tag = {
      name: input.name,
      purpose: input.purpose,
      use_when: input.use_when,
      example: input.example,
      enforcement: input.enforcement,
      usage_count: 0,
      created_at: now,
      updated_at: now,
    };

    await storage.createTag(tag);
    return reply.status(201).send(tag);
  });

  // Update a tag
  app.put("/api/v1/tags/:name", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid tag name", details: paramResult.error.issues });
    }
    const { name } = paramResult.data;
    const existing = await storage.getTag(name);
    if (!existing) {
      return reply.status(404).send({ error: "Tag not found" });
    }

    const parseResult = updateTagSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const input = parseResult.data;
    const now = new Date().toISOString();

    const updates = {
      purpose: input.purpose ?? existing.purpose,
      use_when: input.use_when ?? existing.use_when,
      example: input.example ?? existing.example,
      enforcement: input.enforcement ?? existing.enforcement,
      updated_at: now,
    };

    await storage.updateTag(name, updates);
    const updated = await storage.getTag(name);
    return reply.send(updated);
  });

  // Delete (remove) a tag
  app.delete("/api/v1/tags/:name", async (request, reply) => {
    const paramResult = nameParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid tag name", details: paramResult.error.issues });
    }
    const { name } = paramResult.data;
    const existing = await storage.getTag(name);
    if (!existing) {
      return reply.status(404).send({ error: "Tag not found" });
    }

    await storage.deleteTag(name);
    return reply.status(204).send();
  });
}
