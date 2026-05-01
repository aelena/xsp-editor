import Fastify from "fastify";
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
import type { AppConfig } from "./config.js";

export interface BuildAppOptions {
  storage?: StorageAdapter;
  config?: AppConfig;
}

export function buildApp(optionsOrStorage?: BuildAppOptions | StorageAdapter) {
  // Support legacy signature: buildApp(storage)
  let storage: StorageAdapter | undefined;
  let config: AppConfig | undefined;
  if (optionsOrStorage && "storage" in optionsOrStorage) {
    ({ storage, config } = optionsOrStorage as BuildAppOptions);
  } else {
    storage = optionsOrStorage as StorageAdapter | undefined;
  }
  const app = Fastify({ logger: true });
  const adapter = storage || new MemoryStorageAdapter();

  // API key authentication hook
  if (config?.apiAuthToken) {
    const expectedToken = config.apiAuthToken;
    app.addHook("onRequest", async (request, reply) => {
      // Skip auth for health check
      if (request.url === "/health") return;

      const authHeader = request.headers["authorization"];
      const apiKeyHeader = request.headers["x-api-key"];

      let token: string | undefined;

      if (apiKeyHeader) {
        token = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
      } else if (authHeader) {
        const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
        if (header.startsWith("Bearer ")) {
          token = header.slice(7);
        }
      }

      if (token !== expectedToken) {
        return reply.status(401).send({ error: "Unauthorized: invalid or missing API key" });
      }
    });
  }

  // Health check endpoint (always unauthenticated)
  app.get("/health", async () => ({ status: "ok" }));

  registerPromptRoutes(app, adapter);
  registerTagRoutes(app, adapter);
  registerConstraintRoutes(app, adapter);
  registerVerifyRoutes(app, adapter);
  registerTemplateRoutes(app, adapter);
  registerProjectRoutes(app);
  registerFileRoutes(app);
  registerRenderRoutes(app);
  registerLLMRoutes(app);

  return app;
}
