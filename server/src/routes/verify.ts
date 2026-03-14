import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "../storage/adapter.js";
import {
  verifyRequestSchema,
  verifyFixRequestSchema,
} from "../schemas/verify.js";
import { runVerification } from "../services/verification.js";
import {
  applyVerificationFix,
  isRuleBasedFixable,
} from "../services/verification-fix.js";

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
    const tags = await storage.listTags();

    const result = runVerification(content, {
      approvedTags: tags,
      documentedVariables: variables,
    });

    return reply.send(result);
  });

  app.post("/api/v1/verify/fix", async (request, reply) => {
    const parseResult = verifyFixRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { content, rule, message, variables } = parseResult.data;

    if (!isRuleBasedFixable(rule)) {
      return reply.status(400).send({
        error: `Rule "${rule}" does not support auto-fix`,
      });
    }

    try {
      const result = applyVerificationFix(rule, content, message, variables);
      return reply.send(result);
    } catch (err) {
      return reply.status(400).send({
        error: (err as Error).message,
      });
    }
  });
}
