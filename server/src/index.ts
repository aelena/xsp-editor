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
import { registerAuthRoutes, type AuthContext } from "./routes/auth.js";
import { registerLabelRoutes } from "./routes/labels.js";
import { MemoryLabelStore, SqliteLabelStore, type LabelStore } from "./storage/label-store.js";
import { MemoryAuthStore, SqliteAuthStore } from "./storage/auth-store.js";
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

/**
 * The user and session store that goes with this configuration.
 *
 * Memory storage gets a memory auth store: accounts that vanish with the
 * process are useless, but so is the data they would have guarded, and pairing
 * them keeps "nothing here survives" a single, honest statement.
 */
/** The label store that goes with this adapter, sharing its connection. */
export function createLabelStore(adapter: StorageAdapter): LabelStore {
  return adapter instanceof SqliteStorageAdapter
    ? new SqliteLabelStore(adapter.database())
    : new MemoryLabelStore();
}

export function createAuthStore(config: AppConfig, adapter: StorageAdapter): AuthContext {
  const store =
    adapter instanceof SqliteStorageAdapter
      ? new SqliteAuthStore(adapter.database())
      : new MemoryAuthStore();
  return { store, required: config.authRequired };
}

export function buildApp(
  storage?: StorageAdapter,
  auditLog?: AuditLog,
  auth?: AuthContext,
  labelStore?: LabelStore,
) {
  const app = Fastify({ logger: true });
  // All injectable, so tests get a store, a trail and a gate that touch nothing.
  const adapter = storage || new MemoryStorageAdapter();
  const audit = auditLog || createFileAuditLog(auditPath(loadConfig()));
  // Open by default here, because the overwhelming majority of callers of
  // buildApp are tests that are not about authentication. server.ts decides the
  // real answer from the configuration.
  const authContext: AuthContext = auth ?? { store: new MemoryAuthStore(), required: false };

  const labels = labelStore ?? new MemoryLabelStore();

  // First, so the gate is in place before anything it guards.
  registerAuthRoutes(app, authContext);

  registerPromptRoutes(app, adapter, audit);
  registerTagRoutes(app, adapter);
  registerConstraintRoutes(app, adapter);
  registerVerifyRoutes(app, adapter);
  registerTemplateRoutes(app, adapter);
  registerProjectRoutes(app, adapter, audit);
  registerMembershipRoutes(app, adapter, audit);
  registerLabelRoutes(app, adapter, labels, audit);
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
