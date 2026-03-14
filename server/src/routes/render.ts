import type { FastifyInstance } from "fastify";
import { renderRequestSchema } from "../schemas/render.js";
import { renderTemplate } from "../services/renderer.js";

export function registerRenderRoutes(app: FastifyInstance): void {
  app.post("/api/v1/render", async (request, reply) => {
    const parseResult = renderRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { content, variables } = parseResult.data;
    const result = renderTemplate(content, variables);
    return reply.send(result);
  });
}
