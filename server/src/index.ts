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
import { SqliteStorageAdapter } from "./storage/sqlite.js";
import type { StorageAdapter } from "./storage/adapter.js";
import { createFileAuditLog, type AuditLog } from "./services/audit.js";
import { auditPath, databasePath, loadConfig, type AppConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the storage and the audit trail the configuration asks for.
 *
 * The two are made together because they belong together: the SQLite adapter's
 * trail lives in the same file as the data it describes, so a copied database
 * carries its own history. Only the memory adapter, which keeps nothing, falls
 * back to the JSONL file, where it is the one durable record there is.
 */
export function createStorage(config: AppConfig): {
  adapter: StorageAdapter;
  audit: AuditLog;
} {
  if (config.storage === "memory") {
    return {
      adapter: new MemoryStorageAdapter(),
      audit: createFileAuditLog(auditPath(config)),
    };
  }
  const adapter = new SqliteStorageAdapter(databasePath(config));
  return { adapter, audit: adapter.auditLog() };
}

export function buildApp(storage?: StorageAdapter, auditLog?: AuditLog) {
  const app = Fastify({ logger: true });
  // Both injectable, so tests get a store and a trail that touch nothing.
  const adapter = storage || new MemoryStorageAdapter();
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
