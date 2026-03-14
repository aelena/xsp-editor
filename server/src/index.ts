import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { registerPromptRoutes } from "./routes/prompts.js";
import { registerTagRoutes } from "./routes/tags.js";
import { registerConstraintRoutes } from "./routes/constraints.js";
import { registerVerifyRoutes } from "./routes/verify.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerRenderRoutes } from "./routes/render.js";
import { registerLLMRoutes } from "./routes/llm.js";
import type { StorageAdapter } from "./storage/adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildApp(storage?: StorageAdapter) {
  const app = Fastify({ logger: true });
  const adapter = storage || new MemoryStorageAdapter();

  registerPromptRoutes(app, adapter);
  registerTagRoutes(app, adapter);
  registerConstraintRoutes(app, adapter);
  registerVerifyRoutes(app, adapter);
  registerTemplateRoutes(app, adapter);
  registerProjectRoutes(app);
  registerFileRoutes(app);
  registerRenderRoutes(app);
  registerLLMRoutes(app);

  // Serve user manual
  app.get("/api/v1/manual", async (_request, reply) => {
    try {
      const manualPath = join(__dirname, "..", "..", "user_manual.md");
      const content = await readFile(manualPath, "utf-8");
      reply.send({ content });
    } catch {
      reply.status(404).send({ error: "User manual not found" });
    }
  });

  return app;
}
