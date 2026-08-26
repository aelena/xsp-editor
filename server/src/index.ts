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
import { registerMembershipRoutes } from "./routes/membership.js";
import type { StorageAdapter } from "./storage/adapter.js";
import { createFileAuditLog, type AuditLog } from "./services/audit.js";
import { auditPath, loadConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildApp(storage?: StorageAdapter, auditLog?: AuditLog) {
  const app = Fastify({ logger: true });
  const adapter = storage || new MemoryStorageAdapter();
  // Injectable so tests can keep the trail in memory. The default is a file
  // because, with an in-memory store, it is the only durable record there is.
  const audit = auditLog || createFileAuditLog(auditPath(loadConfig()));

  registerPromptRoutes(app, adapter, audit);
  registerTagRoutes(app, adapter);
  registerConstraintRoutes(app, adapter);
  registerVerifyRoutes(app, adapter);
  registerTemplateRoutes(app, adapter);
  registerProjectRoutes(app, adapter, audit);
  registerMembershipRoutes(app, adapter, audit);
  registerFileRoutes(app, adapter);
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
