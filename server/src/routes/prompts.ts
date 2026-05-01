import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  createPromptSchema,
  updatePromptSchema,
  listPromptsQuerySchema,
  type PromptRecord,
  type PromptVersionRecord,
} from "../schemas/prompts.js";
import { uuidParamSchema, promptVersionParamSchema } from "../schemas/params.js";
import {
  incrementVersion,
  extractTagsUsed,
  extractConstraintsReferenced,
  extractVariablesFromContent,
} from "../services/versioning.js";

export function registerPromptRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
): void {
  // List all prompts
  app.get("/api/v1/prompts", async (request, reply) => {
    const parseResult = listPromptsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: parseResult.error.issues,
      });
    }

    const result = await storage.listPrompts(parseResult.data);
    return reply.send(result);
  });

  // Create a new prompt
  app.post("/api/v1/prompts", async (request, reply) => {
    const parseResult = createPromptSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const input = parseResult.data;
    const now = new Date().toISOString();
    const id = uuidv4();
    const version = "1.0.0";

    const tagsUsed = extractTagsUsed(input.content);
    const constraintsReferenced = extractConstraintsReferenced(input.content);

    // Build variables from input or auto-extract from content
    const detectedVars = extractVariablesFromContent(input.content);
    const variables: Record<string, { description: string; required?: boolean }> =
      input.variables || {};
    for (const v of detectedVars) {
      if (!(v in variables)) {
        variables[v] = { description: "", required: true };
      }
    }

    const prompt: PromptRecord = {
      id,
      name: input.name,
      description: input.description,
      version,
      content: input.content,
      variables,
      tags_used: tagsUsed,
      constraints_referenced: constraintsReferenced,
      author: input.author,
      created_at: now,
      updated_at: now,
      verification_status: "unchecked",
      metadata: input.metadata || {},
      deleted: false,
    };

    await storage.createPrompt(prompt);

    // Save the initial version to blob storage
    const versionRecord: PromptVersionRecord = {
      prompt_id: id,
      version,
      content: input.content,
      author: input.author,
      changelog_summary: "Initial version",
      version_bump_type: "major",
      created_at: now,
    };
    await storage.saveVersion(versionRecord);

    return reply.status(201).send(prompt);
  });

  // Get a prompt by ID
  app.get("/api/v1/prompts/:id", async (request, reply) => {
    const paramResult = uuidParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid prompt ID", details: paramResult.error.issues });
    }
    const { id } = paramResult.data;
    const prompt = await storage.getPrompt(id);
    if (!prompt) {
      return reply.status(404).send({ error: "Prompt not found" });
    }
    return reply.send(prompt);
  });

  // Update a prompt (creates a new version)
  app.put("/api/v1/prompts/:id", async (request, reply) => {
    const paramResult = uuidParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid prompt ID", details: paramResult.error.issues });
    }
    const { id } = paramResult.data;
    const existing = await storage.getPrompt(id);
    if (!existing) {
      return reply.status(404).send({ error: "Prompt not found" });
    }

    const parseResult = updatePromptSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const input = parseResult.data;
    const now = new Date().toISOString();
    const newVersion = incrementVersion(
      existing.version,
      input.version_bump || "patch",
    );
    const newContent = input.content || existing.content;

    const tagsUsed = extractTagsUsed(newContent);
    const constraintsReferenced = extractConstraintsReferenced(newContent);

    // Merge variables
    const detectedVars = extractVariablesFromContent(newContent);
    const variables: Record<string, { description: string; required?: boolean }> =
      input.variables || existing.variables;
    for (const v of detectedVars) {
      if (!(v in variables)) {
        variables[v] = { description: "", required: true };
      }
    }

    const updates: Partial<PromptRecord> = {
      name: input.name || existing.name,
      description: input.description || existing.description,
      version: newVersion,
      content: newContent,
      variables,
      tags_used: tagsUsed,
      constraints_referenced: constraintsReferenced,
      author: input.author || existing.author,
      updated_at: now,
      metadata: input.metadata || existing.metadata,
    };

    await storage.updatePrompt(id, updates);

    // Save the new version to blob storage
    const versionRecord: PromptVersionRecord = {
      prompt_id: id,
      version: newVersion,
      content: newContent,
      author: input.author || existing.author,
      changelog_summary: input.changelog_summary || "",
      version_bump_type: input.version_bump || "patch",
      created_at: now,
    };
    await storage.saveVersion(versionRecord);

    const updated = await storage.getPrompt(id);
    return reply.send(updated);
  });

  // Soft-delete a prompt
  app.delete("/api/v1/prompts/:id", async (request, reply) => {
    const paramResult = uuidParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid prompt ID", details: paramResult.error.issues });
    }
    const { id } = paramResult.data;
    const existing = await storage.getPrompt(id);
    if (!existing) {
      return reply.status(404).send({ error: "Prompt not found" });
    }

    await storage.deletePrompt(id);
    return reply.status(204).send();
  });

  // List all versions of a prompt
  app.get("/api/v1/prompts/:id/versions", async (request, reply) => {
    const paramResult = uuidParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid prompt ID", details: paramResult.error.issues });
    }
    const { id } = paramResult.data;
    const existing = await storage.getPrompt(id);
    if (!existing) {
      return reply.status(404).send({ error: "Prompt not found" });
    }

    const versions = await storage.listVersions(id);
    return reply.send({ prompt_id: id, versions });
  });

  // Get a specific version
  app.get(
    "/api/v1/prompts/:id/versions/:ver",
    async (request, reply) => {
      const paramResult = promptVersionParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.status(400).send({ error: "Invalid parameters", details: paramResult.error.issues });
      }
      const { id, ver } = paramResult.data;
      const existing = await storage.getPrompt(id);
      if (!existing) {
        return reply.status(404).send({ error: "Prompt not found" });
      }

      const version = await storage.getVersion(id, ver);
      if (!version) {
        return reply.status(404).send({ error: "Version not found" });
      }
      return reply.send(version);
    },
  );

  // Rollback to a specified version
  app.post("/api/v1/prompts/:id/rollback", async (request, reply) => {
    const paramResult = uuidParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid prompt ID", details: paramResult.error.issues });
    }
    const { id } = paramResult.data;
    const existing = await storage.getPrompt(id);
    if (!existing) {
      return reply.status(404).send({ error: "Prompt not found" });
    }

    const body = request.body as { version: string; author?: string };
    if (!body.version) {
      return reply
        .status(400)
        .send({ error: "version is required in request body" });
    }

    const targetVersion = await storage.getVersion(id, body.version);
    if (!targetVersion) {
      return reply.status(404).send({ error: "Target version not found" });
    }

    const now = new Date().toISOString();
    const newVersion = incrementVersion(existing.version, "patch");
    const author = body.author || existing.author;

    const tagsUsed = extractTagsUsed(targetVersion.content);
    const constraintsReferenced = extractConstraintsReferenced(
      targetVersion.content,
    );
    const detectedVars = extractVariablesFromContent(targetVersion.content);
    const variables: Record<string, { description: string; required?: boolean }> = {};
    for (const v of detectedVars) {
      variables[v] = { description: "", required: true };
    }

    await storage.updatePrompt(id, {
      version: newVersion,
      content: targetVersion.content,
      tags_used: tagsUsed,
      constraints_referenced: constraintsReferenced,
      variables,
      author,
      updated_at: now,
    });

    const versionRecord: PromptVersionRecord = {
      prompt_id: id,
      version: newVersion,
      content: targetVersion.content,
      author,
      changelog_summary: `Rolled back to version ${body.version}`,
      version_bump_type: "patch",
      created_at: now,
    };
    await storage.saveVersion(versionRecord);

    const updated = await storage.getPrompt(id);
    return reply.send(updated);
  });
}
