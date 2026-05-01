import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "../storage/adapter.js";
import { verifyRequestSchema } from "../schemas/verify.js";
import { runVerification } from "../services/verification.js";

export function registerVerifyRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
): void {
  app.post("/api/v1/verify", async (request, reply) => {
    const parseResult = verifyRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { content, variables } = parseResult.data;

    // Fetch all tags from registry for context
    const tagsResult = await storage.listTags({ page: 1, limit: 1000 });

    const result = runVerification(content, {
      approvedTags: tagsResult.items,
      documentedVariables: variables,
    });

    return reply.send(result);
  });
}
