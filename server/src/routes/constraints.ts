import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  createConstraintSchema,
  updateConstraintSchema,
  listConstraintsQuerySchema,
} from "../schemas/constraints.js";

export function registerConstraintRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
): void {
  // List all constraints (filterable by severity, category, status)
  app.get("/api/v1/constraints", async (request, reply) => {
    const parseResult = listConstraintsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: parseResult.error.issues,
      });
    }

    const filters = parseResult.data;
    const constraints = await storage.listConstraints(filters);
    return reply.send({ constraints });
  });

  // Get a constraint by ID
  app.get("/api/v1/constraints/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const constraint = await storage.getConstraint(id);
    if (!constraint) {
      return reply.status(404).send({ error: "Constraint not found" });
    }
    return reply.send(constraint);
  });

  // Create a new constraint
  app.post("/api/v1/constraints", async (request, reply) => {
    const parseResult = createConstraintSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const input = parseResult.data;

    // Check if constraint already exists
    const existing = await storage.getConstraint(input.id);
    if (existing) {
      return reply.status(409).send({ error: "Constraint already exists" });
    }

    const now = new Date().toISOString();
    const constraint = {
      id: input.id,
      description: input.description,
      severity: input.severity,
      category: input.category,
      owner: input.owner,
      status: input.status,
      xml_block: input.xml_block,
      usage_count: 0,
      created_at: now,
      updated_at: now,
    };

    await storage.createConstraint(constraint);
    return reply.status(201).send(constraint);
  });

  // Update a constraint
  app.put("/api/v1/constraints/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await storage.getConstraint(id);
    if (!existing) {
      return reply.status(404).send({ error: "Constraint not found" });
    }

    const parseResult = updateConstraintSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const input = parseResult.data;
    const now = new Date().toISOString();

    const updates = {
      description: input.description ?? existing.description,
      severity: input.severity ?? existing.severity,
      category: input.category ?? existing.category,
      owner: input.owner ?? existing.owner,
      status: input.status ?? existing.status,
      xml_block: input.xml_block ?? existing.xml_block,
      updated_at: now,
    };

    await storage.updateConstraint(id, updates);
    const updated = await storage.getConstraint(id);
    return reply.send(updated);
  });

  // Delete (retire) a constraint
  app.delete("/api/v1/constraints/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await storage.getConstraint(id);
    if (!existing) {
      return reply.status(404).send({ error: "Constraint not found" });
    }

    await storage.deleteConstraint(id);
    return reply.status(204).send();
  });
}
